import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

function Settings() {
  const [settings, setSettings] = useState({ 
    GROQ_API_KEY: '',
    temperature: 0.7,
    top_p: 0.95,
    mcpServers: {},
    systemMessage: null
  });
  const [saveStatus, setSaveStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [newMcpServer, setNewMcpServer] = useState({
    id: '',
    command: '',
    args: '',
    env: {}
  });
  const [useJsonInput, setUseJsonInput] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [settingsPath, setSettingsPath] = useState('');
  const [newEnvVar, setNewEnvVar] = useState({ key: '', value: '' });
  
  const statusTimeoutRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsData = await window.electron.getSettings();
        setSettings(settingsData);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    const getSettingsPath = async () => {
      try {
        const path = await window.electron.getSettingsPath();
        setSettingsPath(path);
      } catch (error) {
        console.error('Error getting settings path:', error);
      }
    };

    loadSettings();
    getSettingsPath();

    // Cleanup timeouts on unmount
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  // Save settings with debounce
  const saveSettings = (updatedSettings) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set saving indicator immediately without status message
    setIsSaving(true);
    
    // Debounce the actual save operation
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await window.electron.saveSettings(updatedSettings);
        if (result.success) {
          setSaveStatus({ type: 'success', message: 'Settings saved' });
          
          // Clear success message after delay
          if (statusTimeoutRef.current) {
            clearTimeout(statusTimeoutRef.current);
          }
          statusTimeoutRef.current = setTimeout(() => {
            setSaveStatus(null);
          }, 2000);
        } else {
          setSaveStatus({ type: 'error', message: `Failed to save: ${result.error}` });
        }
      } catch (error) {
        console.error('Error saving settings:', error);
        setSaveStatus({ type: 'error', message: `Error: ${error.message}` });
      } finally {
        setIsSaving(false);
      }
    }, 800); // Increased debounce time to reduce flickering
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const updatedSettings = { ...settings, [name]: value };
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    const updatedSettings = { ...settings, [name]: parseFloat(value) };
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  const handleNewMcpServerChange = (e) => {
    const { name, value } = e.target;
    setNewMcpServer(prev => ({ ...prev, [name]: value }));
  };

  const addEnvVar = () => {
    if (!newEnvVar.key) return;
    
    setNewMcpServer(prev => ({
      ...prev,
      env: {
        ...prev.env,
        [newEnvVar.key]: newEnvVar.value
      }
    }));
    
    setNewEnvVar({ key: '', value: '' });
  };

  const removeEnvVar = (key) => {
    setNewMcpServer(prev => {
      const updatedEnv = { ...prev.env };
      delete updatedEnv[key];
      return { ...prev, env: updatedEnv };
    });
  };

  const handleEnvVarChange = (e) => {
    const { name, value } = e.target;
    setNewEnvVar(prev => ({ ...prev, [name]: value }));
  };

  const handleJsonInputChange = (e) => {
    setJsonInput(e.target.value);
    setJsonError(null);
  };

  const parseJsonInput = () => {
    try {
      if (!jsonInput.trim()) {
        throw new Error("JSON input is empty");
      }
      
      const parsedJson = JSON.parse(jsonInput);
      
      // Check if it's a valid MCP server config
      if (typeof parsedJson !== 'object') {
        throw new Error("JSON must be an object");
      }
      
      // Create a normalized server entry
      const serverEntry = {};
      
      if ('command' in parsedJson) {
        serverEntry.command = parsedJson.command;
      } else {
        throw new Error("Server config must include 'command' field");
      }
      
      // Handle args field
      if ('args' in parsedJson) {
        if (Array.isArray(parsedJson.args)) {
          serverEntry.args = parsedJson.args;
        } else {
          throw new Error("'args' must be an array");
        }
      } else {
        serverEntry.args = [];
      }
      
      // Handle env field
      if ('env' in parsedJson) {
        if (typeof parsedJson.env === 'object' && parsedJson.env !== null) {
          serverEntry.env = parsedJson.env;
        } else {
          throw new Error("'env' must be an object");
        }
      } else {
        serverEntry.env = {};
      }
      
      return serverEntry;
    } catch (error) {
      setJsonError(error.message);
      return null;
    }
  };

  const addMcpServer = (e) => {
    e.preventDefault();
    
    let serverConfig;
    let serverId;
    
    if (useJsonInput) {
      const parsedConfig = parseJsonInput();
      if (!parsedConfig) return;
      
      // Extract first key as server ID if JSON is a full mcpServers object
      const keys = Object.keys(parsedConfig);
      if (keys.length === 0) {
        setJsonError("Cannot determine server ID");
        return;
      }
      
      if (!newMcpServer.id.trim()) {
        setJsonError("Server ID is required");
        return;
      }
      
      serverId = newMcpServer.id;
      serverConfig = parsedConfig;
    } else {
      if (!newMcpServer.id || !newMcpServer.command) {
        setSaveStatus({ type: 'error', message: 'Server ID and command are required' });
        return;
      }
      
      serverId = newMcpServer.id;
      
      // Parse args into array, splitting by spaces and handling quoted sections
      let args = [];
      if (newMcpServer.args) {
        // This is a simple parser that handles quoted arguments
        const argsStr = newMcpServer.args.trim();
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < argsStr.length; i++) {
          const char = argsStr[i];
          
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
          } else if (char === ' ' && !inQuotes) {
            if (current) {
              args.push(current);
              current = '';
            }
          } else {
            current += char;
          }
        }
        
        if (current) {
          args.push(current);
        }
      }
      
      serverConfig = {
        command: newMcpServer.command,
        args,
        env: newMcpServer.env
      };
    }

    // Update settings with new MCP server
    const updatedSettings = {
      ...settings,
      mcpServers: {
        ...settings.mcpServers,
        [serverId]: serverConfig
      }
    };

    setSettings(updatedSettings);
    saveSettings(updatedSettings);
    
    // Clear the form
    setNewMcpServer({ id: '', command: '', args: '', env: {} });
    setJsonInput('');
    setJsonError(null);
  };

  const removeMcpServer = (serverId) => {
    const updatedMcpServers = { ...settings.mcpServers };
    delete updatedMcpServers[serverId];
    
    const updatedSettings = {
      ...settings,
      mcpServers: updatedMcpServers
    };
    
    setSettings(updatedSettings);
    saveSettings(updatedSettings);
  };

  // Determine what status message to show
  const getStatusMessage = () => {
    if (isSaving) return 'Saving...';
    return saveStatus?.message || '';
  };

  const reloadSettingsFromDisk = async () => {
    try {
      setSaveStatus({ type: 'info', message: 'Reloading settings...' });
      const result = await window.electron.reloadSettings();
      
      if (result.success) {
        setSettings(result.settings);
        setSaveStatus({ type: 'success', message: 'Settings reloaded' });
      } else {
        setSaveStatus({ type: 'error', message: `Failed to reload: ${result.error}` });
      }
      
      // Clear status message after delay
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      statusTimeoutRef.current = setTimeout(() => {
        setSaveStatus(null);
      }, 2000);
    } catch (error) {
      console.error('Error reloading settings:', error);
      setSaveStatus({ type: 'error', message: `Error: ${error.message}` });
    }
  };

  // Function to reset tool call approvals in localStorage
  const handleResetToolApprovals = () => {
    setIsSaving(true); // Use saving indicator
    setSaveStatus({ type: 'info', message: 'Resetting approvals...' });

    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('tool_approval_') || key === 'tool_approval_yolo_mode')) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`Removed tool approval key: ${key}`);
      });

      setSaveStatus({ type: 'success', message: 'Tool call approvals reset' });
    } catch (error) {
      console.error('Error resetting tool approvals:', error);
      setSaveStatus({ type: 'error', message: `Error resetting: ${error.message}` });
    } finally {
      setIsSaving(false);
      // Clear status message after delay
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      statusTimeoutRef.current = setTimeout(() => {
        setSaveStatus(null);
      }, 2000);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-user-message-bg shadow">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-white">Configuration</h1>
          <div className="flex space-x-4">
            <button
              onClick={reloadSettingsFromDisk}
              className="px-4 py-2 bg-gray-700 text-gray-100 rounded hover:bg-gray-600 transition-colors"
            >
              Reload From Disk
            </button>
            <Link to="/" className="btn btn-primary">Back to Chat</Link>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-8 bg-custom-dark-bg">
        <div className="max-w-2xl mx-auto bg-user-message-bg rounded-lg p-6 relative">
          <div className="absolute top-2 right-2 min-h-6">
            {(isSaving || saveStatus) && (
              <div
                className={`px-3 py-1 rounded text-sm transition-opacity duration-300 ${
                  saveStatus?.type === 'error'
                    ? 'bg-red-900 text-red-100'
                    : saveStatus?.type === 'info'
                    ? 'bg-blue-900 text-blue-100'
                    : 'bg-green-900 text-green-100'
                }`}
              >
                {getStatusMessage()}
              </div>
            )}
          </div>

          {settingsPath && (
            <div className="mb-4 p-3 rounded text-sm bg-custom-dark-bg">
              <p className="text-gray-400">
                Settings file location: <span className="font-mono text-gray-300">{settingsPath}</span>
              </p>
            </div>
          )}

          <h2 className="text-xl font-semibold mb-4 text-white">Groq API Settings</h2>
          
          <div className="mb-4">
            <label htmlFor="api-key" className="block text-sm font-medium text-gray-300 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? "text" : "password"}
                id="api-key"
                name="GROQ_API_KEY"
                value={settings.GROQ_API_KEY || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-white placeholder-gray-400"
                placeholder="Enter your GROQ API key"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                    <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="system-message" className="block text-sm font-medium text-gray-300 mb-2">
              System Message
            </label>
            <textarea
              id="system-message"
              name="systemMessage"
              value={settings.systemMessage || ''}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-white placeholder-gray-400"
              placeholder="Enter a system message to guide the AI's behavior"
              rows={4}
            />
            <p className="mt-1 text-xs text-gray-400">
              This message will be used to set the initial behavior of the AI. Leave empty to use the default.
            </p>
          </div>

          <h3 className="text-lg font-medium mt-6 mb-3 text-white">Generation Parameters</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="temperature" className="block text-sm font-medium text-gray-300 mb-2">
                Temperature: {settings.temperature}
              </label>
              <div className="flex items-center">
                <span className="mr-2 text-xs text-gray-400">0</span>
                <input
                  type="range"
                  id="temperature"
                  name="temperature"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.temperature}
                  onChange={handleNumberChange}
                  className="w-full"
                />
                <span className="ml-2 text-xs text-gray-400">1</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Lower values make responses more deterministic, higher values more creative.
              </p>
            </div>
            
            <div>
              <label htmlFor="top_p" className="block text-sm font-medium text-gray-300 mb-2">
                Top P: {settings.top_p}
              </label>
              <div className="flex items-center">
                <span className="mr-2 text-xs text-gray-400">0</span>
                <input
                  type="range"
                  id="top_p"
                  name="top_p"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.top_p}
                  onChange={handleNumberChange}
                  className="w-full"
                />
                <span className="ml-2 text-xs text-gray-400">1</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Controls diversity by limiting tokens to the most likely ones.
              </p>
            </div>
          </div>

          <h3 className="text-lg font-medium mt-8 mb-3 text-white">MCP Servers</h3>
          <p className="text-sm text-gray-400 mb-4">
            Configure MCP servers that will be automatically started when the application launches. 
            These servers provide additional tools that can be used by the AI.
          </p>
          
          {Object.keys(settings.mcpServers || {}).length > 0 ? (
            <div className="mb-6">
              <h4 className="font-medium text-sm text-gray-300 mb-2">Configured Servers:</h4>
              <div className="border border-gray-700 rounded-md overflow-hidden">
                {Object.entries(settings.mcpServers || {}).map(([id, config]) => (
                  <div 
                    key={id} 
                    className="p-3 border-b border-gray-700 last:border-b-0 flex justify-between items-start bg-custom-dark-bg"
                  >
                    <div>
                      <div className="font-medium text-gray-300">{id}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        <div><span className="font-mono">$ {config.command} {(config.args || []).join(' ')}</span></div>
                        {config.env && Object.keys(config.env).length > 0 && (
                          <div className="mt-1">
                            <span className="text-xs text-gray-400">Environment variables:</span>
                            <div className="pl-2 mt-1">
                              {Object.entries(config.env).map(([key, value]) => (
                                <div key={key} className="text-xs font-mono">
                                  <span className="text-gray-300">{key}=</span><span className="text-gray-400">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => removeMcpServer(id)}
                      className="text-red-400 hover:text-red-300 text-sm py-1 px-2 bg-red-900 hover:bg-red-800 rounded"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-6 p-4 bg-custom-dark-bg rounded-md text-center text-gray-500">
              No MCP servers configured. Add one below.
            </div>
          )}
          
          <div className="border border-gray-700 rounded-md p-4">
            <h4 className="font-medium text-sm text-gray-300 mb-3">Add New MCP Server:</h4>
            
            <div className="mb-4 flex">
              <button
                type="button"
                className={`px-4 py-2 text-sm rounded-l ${!useJsonInput ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                onClick={() => setUseJsonInput(false)}
              >
                Form
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm rounded-r ${useJsonInput ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                onClick={() => setUseJsonInput(true)}
              >
                JSON
              </button>
            </div>
            
            <form onSubmit={addMcpServer}>
              <div className="mb-3">
                <label htmlFor="server-id" className="block text-sm font-medium text-gray-300 mb-1">
                  Server ID:
                </label>
                <input
                  type="text"
                  id="server-id"
                  name="id"
                  value={newMcpServer.id}
                  onChange={handleNewMcpServerChange}
                  className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm"
                  placeholder="e.g., filesystem"
                  required
                />
              </div>
              
              {!useJsonInput ? (
                <>
                  <div className="mb-3">
                    <label htmlFor="server-command" className="block text-sm font-medium text-gray-300 mb-1">
                      Command:
                    </label>
                    <input
                      type="text"
                      id="server-command"
                      name="command"
                      value={newMcpServer.command}
                      onChange={handleNewMcpServerChange}
                      className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm"
                      placeholder="e.g., npx"
                      required
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="server-args" className="block text-sm font-medium text-gray-300 mb-1">
                      Arguments (space separated, use quotes for args with spaces):
                    </label>
                    <input
                      type="text"
                      id="server-args"
                      name="args"
                      value={newMcpServer.args}
                      onChange={handleNewMcpServerChange}
                      className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm"
                      placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path/to/dir"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-gray-300">
                        Environment Variables:
                      </label>
                    </div>
                    
                    {Object.keys(newMcpServer.env).length > 0 && (
                      <div className="mb-3 border border-gray-700 rounded-md overflow-hidden">
                        {Object.entries(newMcpServer.env).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center p-2 border-b border-gray-700 last:border-b-0 bg-custom-dark-bg">
                            <div className="flex-1 font-mono text-sm">
                              <span className="text-gray-300">{key}=</span>
                              <span className="text-gray-400">{value}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeEnvVar(key)}
                              className="text-red-400 hover:text-red-300 text-xs py-1 px-2"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newEnvVar.key}
                        onChange={e => handleEnvVarChange(e)}
                        name="key"
                        placeholder="KEY"
                        className="flex-1 px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm"
                      />
                      <input
                        type="text"
                        value={newEnvVar.value}
                        onChange={e => handleEnvVarChange(e)}
                        name="value"
                        placeholder="VALUE"
                        className="flex-1 px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm"
                      />
                      <button
                        type="button"
                        onClick={addEnvVar}
                        disabled={!newEnvVar.key}
                        className="px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mb-4">
                  <label htmlFor="json-input" className="block text-sm font-medium text-gray-300 mb-1">
                    Server Configuration JSON:
                  </label>
                  <textarea
                    id="json-input"
                    value={jsonInput}
                    onChange={handleJsonInputChange}
                    className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm font-mono"
                    placeholder='{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-brave-search"], "env": { "BRAVE_API_KEY": "YOUR_KEY_HERE" } }'
                    rows={8}
                  />
                  {jsonError && (
                    <p className="mt-1 text-sm text-red-400">{jsonError}</p>
                  )}
                </div>
              )}
              
              <button
                type="submit"
                className="w-full py-2 bg-primary hover:bg-primary/90 text-white rounded transition-colors text-sm"
              >
                Add Server
              </button>
            </form>
          </div>

          {/* Reset Tool Approvals Section */}
          <div className="mt-8 border-t border-gray-700 pt-6">
            <h3 className="text-lg font-medium mb-3 text-white">Tool Call Permissions</h3>
            <p className="text-sm text-gray-400 mb-4">
              Reset all saved permissions for tool calls. You will be prompted again the next time each tool is invoked.
            </p>
            <button
              onClick={handleResetToolApprovals}
              className="px-4 py-2 bg-yellow-700 text-gray-100 rounded hover:bg-yellow-800 focus:outline-none focus:ring-2 focus:ring-yellow-600 focus:ring-opacity-70 transition-colors"
            >
              Reset Tool Call Approvals
            </button>
          </div>

          <div className="mt-8">
            <h3 className="text-lg font-medium mb-2 text-white">Current Configuration:</h3>
            <pre 
              className="p-4 rounded overflow-auto text-gray-300 bg-custom-dark-bg" 
            >
              {JSON.stringify(settings, null, 2)}
            </pre>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Settings; 