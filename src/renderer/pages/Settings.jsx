import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

function Settings() {
  const [settings, setSettings] = useState({
    GROQ_API_KEY: '',
    temperature: 0.7,
    top_p: 0.95,
    mcpServers: {},
    disabledMcpServers: [],
    customSystemPrompt: ''
  });
  const [saveStatus, setSaveStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [newMcpServer, setNewMcpServer] = useState({
    id: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: {},
    url: ''
  });
  const [useJsonInput, setUseJsonInput] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [settingsPath, setSettingsPath] = useState('');
  const [newEnvVar, setNewEnvVar] = useState({ key: '', value: '' });
  const [editingServerId, setEditingServerId] = useState(null);
  
  const statusTimeoutRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settingsData = await window.electron.getSettings();
        if (!settingsData.disabledMcpServers) {
            settingsData.disabledMcpServers = [];
        }
        setSettings(settingsData);
      } catch (error) {
        console.error('Error loading settings:', error);
        setSettings(prev => ({
            ...prev,
            GROQ_API_KEY: '',
            temperature: 0.7,
            top_p: 0.95,
            mcpServers: {},
            disabledMcpServers: [],
            customSystemPrompt: ''
        }));
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
        const settingsToSave = {
            ...updatedSettings,
            disabledMcpServers: updatedSettings.disabledMcpServers || []
        };
        const result = await window.electron.saveSettings(settingsToSave);
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

  const handleTransportChange = (e) => {
    const transportType = e.target.value;
    setNewMcpServer(prev => ({
        ...prev,
        transport: transportType,
        command: transportType === 'sse' ? '' : prev.command,
        args: transportType === 'sse' ? '' : prev.args,
        env: transportType === 'sse' ? {} : prev.env,
        url: transportType === 'stdio' ? '' : prev.url
    }));
    setJsonInput('');
    setJsonError(null);
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
    setUseJsonInput(false);
    setJsonError(null);
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
      
      // Check for transport type in JSON (optional, default to stdio if missing)
      const transport = parsedJson.transport === 'sse' ? 'sse' : 'stdio';
      serverEntry.transport = transport;

      if (transport === 'stdio') {
          if ('command' in parsedJson) {
              serverEntry.command = parsedJson.command;
          } else {
              throw new Error("Stdio server config must include 'command' field");
          }

          // Handle args field for stdio
          if ('args' in parsedJson) {
              if (Array.isArray(parsedJson.args)) {
              serverEntry.args = parsedJson.args;
              } else {
              throw new Error("'args' must be an array for stdio config");
              }
          } else {
              serverEntry.args = [];
          }

          // Handle env field for stdio
          if ('env' in parsedJson) {
              if (typeof parsedJson.env === 'object' && parsedJson.env !== null) {
              serverEntry.env = parsedJson.env;
              } else {
              throw new Error("'env' must be an object for stdio config");
              }
          } else {
              serverEntry.env = {};
          }
          // Ensure url field is not present or empty for stdio
          serverEntry.url = '';

      } else { // transport === 'sse'
          if ('url' in parsedJson && typeof parsedJson.url === 'string' && parsedJson.url.trim() !== '') {
              serverEntry.url = parsedJson.url;
          } else {
              throw new Error("SSE server config must include a non-empty 'url' field");
          }
           // Ensure stdio fields are not present or empty for sse
          serverEntry.command = '';
          serverEntry.args = [];
          serverEntry.env = {};
      }

      return serverEntry;
    } catch (error) {
      setJsonError(error.message);
      return null;
    }
  };

  // Helper function to parse args string into array
  const parseArgsString = (argsStr) => {
    if (!argsStr) return [];
    let args = [];
    const trimmedArgsStr = argsStr.trim();
    let current = '';
    let inQuotes = false;
    let quoteChar = null;

    for (let i = 0; i < trimmedArgsStr.length; i++) {
      const char = trimmedArgsStr[i];

      if ((char === '"' || char === "'") && (quoteChar === null || quoteChar === char)) {
        if (inQuotes) {
          // Ending quote
          inQuotes = false;
          quoteChar = null;
        } else {
          // Starting quote
          inQuotes = true;
          quoteChar = char;
        }
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
    return args;
  };

  // Switches view to Form, converting JSON state if valid
  const switchToFormView = () => {
    if (!useJsonInput) return; // Already in form view

    try {
      const parsedJson = JSON.parse(jsonInput || '{}');
      if (typeof parsedJson !== 'object' || parsedJson === null) {
        throw new Error("JSON must be an object.");
      }
      
      // Basic validation (can be more robust)
      const command = parsedJson.command || '';
      const args = Array.isArray(parsedJson.args) ? parsedJson.args : [];
      const env = typeof parsedJson.env === 'object' && parsedJson.env !== null ? parsedJson.env : {};
      const argsString = args.join(' ');

      setNewMcpServer(prev => ({ ...prev, command, args: argsString, env }));
      setJsonError(null);
      setUseJsonInput(false);
    } catch (error) {
      console.error("Error parsing JSON to switch to form view:", error);
      setJsonError(`Invalid JSON: ${error.message}. Cannot switch to form view.`);
      // Optionally keep the user in JSON view if parsing fails
    }
  };

  // Switches view to JSON, converting form state
  const switchToJsonView = () => {
    if (useJsonInput) return; // Already in JSON view

    try {
      let serverConfig = {};
      if (newMcpServer.transport === 'stdio') {
          const argsArray = parseArgsString(newMcpServer.args);
          serverConfig = {
              transport: 'stdio',
              command: newMcpServer.command,
              args: argsArray,
              env: newMcpServer.env
          };
      } else { // sse or streamableHttp
          serverConfig = {
              transport: newMcpServer.transport, // Keep the selected transport
              url: newMcpServer.url
          };
          // Explicitly exclude stdio fields if they somehow exist
          delete serverConfig.command;
          delete serverConfig.args;
          delete serverConfig.env;
      }

      const jsonString = JSON.stringify(serverConfig, null, 2);
      setJsonInput(jsonString);
      setJsonError(null); // Clear any previous JSON error
      setUseJsonInput(true);
    } catch (error) {
      console.error("Error converting form state to JSON:", error);
      // This should ideally not happen if form state is valid
      setJsonError(`Internal error: Failed to generate JSON. ${error.message}`);
    }
  };

  const handleSaveMcpServer = (e) => {
    e.preventDefault();
    
    let serverConfig;
    
    if (useJsonInput) {
      const parsedConfig = parseJsonInput();
      if (!parsedConfig) return;
      
      // Use the ID from the form field (which is disabled during edit)
      if (!newMcpServer.id.trim()) {
        setJsonError("Server ID is required");
        return;
      }
      
      serverConfig = parsedConfig;
    } else {
      // Use form state
      if (!newMcpServer.id) {
          setSaveStatus({ type: 'error', message: 'Server ID is required' });
          return;
      }

      if (newMcpServer.transport === 'stdio') {
          if (!newMcpServer.command) {
              setSaveStatus({ type: 'error', message: 'Command is required for stdio transport' });
              return;
          }
          // Parse args string from the form field
          const args = parseArgsString(newMcpServer.args);
          serverConfig = {
              transport: 'stdio',
              command: newMcpServer.command,
              args, // Use the parsed array
              env: newMcpServer.env
          };
      } else { // sse or streamableHttp
          if (!newMcpServer.url || !newMcpServer.url.trim()) {
              setSaveStatus({ type: 'error', message: 'URL is required for SSE or Streamable HTTP transport' });
              return;
          }
          try {
              // Basic URL validation
              new URL(newMcpServer.url);
          } catch (urlError) {
              setSaveStatus({ type: 'error', message: `Invalid URL: ${urlError.message}` });
              return;
          }
          serverConfig = {
              transport: newMcpServer.transport,
              url: newMcpServer.url
          };
      }
    }

    // Update settings with new/updated MCP server
    const updatedSettings = {
      ...settings,
      mcpServers: {
        ...settings.mcpServers,
        [newMcpServer.id]: serverConfig // Use ID from state (disabled during edit)
      }
    };

    setSettings(updatedSettings);
    saveSettings(updatedSettings);
    
    // Clear the form, reset to stdio default
    setNewMcpServer({ id: '', transport: 'stdio', command: '', args: '', env: {}, url: '' });
    setJsonInput('');
    setJsonError(null);
    setEditingServerId(null); // Reset editing state after save
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

    // If the removed server was being edited, cancel the edit
    if (editingServerId === serverId) {
      cancelEditing();
    }
  };

  // Function to handle starting the edit process for an MCP server
  const startEditing = (serverId) => {
    const serverToEdit = settings.mcpServers[serverId];
    if (!serverToEdit) return;

    setEditingServerId(serverId);

    // Determine transport type accurately
    let transport;
    if (serverToEdit.transport === 'sse') {
        transport = 'sse';
    } else if (serverToEdit.transport === 'streamableHttp') {
        transport = 'streamableHttp';
    } else {
        transport = 'stdio'; // Default to stdio if missing or other value
    }


    // Populate form fields based on transport type
    let command = '', argsArray = [], envObject = {}, argsString = '', url = '';
    if (transport === 'stdio') {
        command = serverToEdit.command || '';
        argsArray = Array.isArray(serverToEdit.args) ? serverToEdit.args : [];
        envObject = typeof serverToEdit.env === 'object' && serverToEdit.env !== null ? serverToEdit.env : {};
        argsString = argsArray.join(' ');
    } else { // sse or streamableHttp
        url = serverToEdit.url || '';
        // Ensure stdio fields are clear
        command = '';
        argsString = '';
        envObject = {};
    }

    setNewMcpServer({
      id: serverId, // Keep the original ID in the form
      transport: transport, // Set the correct transport type
      command: command,
      args: argsString,
      env: envObject,
      url: url // URL will be populated correctly now
    });

    // Also populate the JSON input field based on the correct structure
    try {
      let jsonConfig;
      if (transport === 'stdio') {
          jsonConfig = { transport: 'stdio', command, args: argsArray, env: envObject };
      } else { // sse or streamableHttp
          // Use the determined transport type for the JSON representation
          jsonConfig = { transport: transport, url };
      }
      const jsonString = JSON.stringify(jsonConfig, null, 2);
      setJsonInput(jsonString);
    } catch (error) {
      console.error("Failed to stringify server config for JSON input:", error);
      setJsonInput(''); // Clear if error
    }

    // Switch to form view when editing starts
    setUseJsonInput(false);
    setJsonError(null);

    // Optional: Scroll to the form or highlight it
    // window.scrollTo({ top: document.getElementById('mcp-form').offsetTop, behavior: 'smooth' });
  };

  // Function to cancel editing
  const cancelEditing = () => {
    setEditingServerId(null);
    setNewMcpServer({ id: '', transport: 'stdio', command: '', args: '', env: {}, url: '' }); // Reset form
    setJsonInput('');
    setJsonError(null);
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

      <main className="flex-1 overflow-y-auto p-8 bg-custom-dark-bg relative">
        {/* Status Message Container - Fixed Position */} 
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 min-h-6 pointer-events-none">
          {(isSaving || saveStatus) && (
            <div
              className={`px-3 py-1 rounded text-sm shadow-lg transition-opacity duration-300 pointer-events-auto ${
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

        <div className="max-w-2xl mx-auto bg-user-message-bg rounded-lg p-6">
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

          {/* Custom System Prompt Section */}
          <div className="mt-6 border-t border-gray-700 pt-6">
            <h3 className="text-lg font-medium mb-3 text-white">Custom System Prompt</h3>
            <p className="text-sm text-gray-400 mb-3">
              Add a custom system prompt here. It will be appended to the default system prompt.
            </p>
            <textarea
              id="custom-system-prompt"
              name="customSystemPrompt"
              value={settings.customSystemPrompt || ''}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-white placeholder-gray-400 text-sm"
              placeholder="Optional: Enter your custom system prompt..."
            />
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
                    className="p-3 border-b border-gray-700 last:border-b-0 bg-custom-dark-bg"
                  >
                    {/* Top row for ID and buttons */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="font-medium text-gray-300 break-all">{id}</div>
                      <div className="flex space-x-2 flex-shrink-0 ml-4">
                        <button
                          onClick={() => startEditing(id)}
                          className="text-blue-400 hover:text-blue-300 text-sm py-1 px-2 bg-blue-900 hover:bg-blue-800 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeMcpServer(id)}
                          className="text-red-400 hover:text-red-300 text-sm py-1 px-2 bg-red-900 hover:bg-red-800 rounded"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    
                    {/* Bottom section for config details */}
                    <div className="text-sm text-gray-500">
                      {config.transport === 'sse' ? (
                        <div><span className="font-mono break-all">Type: SSE | URL: {config.url}</span></div>
                      ) : config.transport === 'streamableHttp' ? (
                        <div><span className="font-mono break-all">Type: Streamable HTTP | URL: {config.url}</span></div>
                      ) : (
                        <>
                          <div><span className="font-mono break-all">Type: Stdio | $ {config.command} {(config.args || []).join(' ')}</span></div>
                          {config.env && Object.keys(config.env).length > 0 && (
                            <div className="mt-1">
                              <span className="text-xs text-gray-400">Environment variables:</span>
                              <div className="pl-2 mt-1">
                                {Object.entries(config.env).map(([key, value]) => (
                                  <div key={key} className="text-xs font-mono break-all">
                                    <span className="text-gray-300">{key}=</span><span className="text-gray-400">
                                      {/* Mask sensitive values (basic example) */}
                                      {key.toLowerCase().includes('key') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret')
                                        ? '********'
                                        : (typeof value === 'string' && value.length > 30 ? `${value.substring(0, 27)}...` : value)
                                      }
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-6 p-4 bg-custom-dark-bg rounded-md text-center text-gray-500">
              No MCP servers configured. Add one below.
            </div>
          )}
          
          <div id="mcp-form" className="border border-gray-700 rounded-md p-4">
            <h4 className="font-medium text-sm text-gray-300 mb-3">
              {editingServerId ? `Editing Server: ${editingServerId}` : 'Add New MCP Server:'}
            </h4>
            
            <div className="mb-4 flex">
              <button
                type="button"
                className={`px-4 py-2 text-sm rounded-l ${!useJsonInput ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                onClick={switchToFormView}
              >
                Form
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-sm rounded-r ${useJsonInput ? 'bg-primary text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                onClick={switchToJsonView}
              >
                JSON
              </button>
            </div>
            
            <form onSubmit={handleSaveMcpServer}>
              <div className="mb-3">
                <label htmlFor="server-id" className="block text-sm font-medium text-gray-300 mb-1">
                  Server ID: {editingServerId && "(Cannot change ID during edit)"}
                </label>
                <input
                  type="text"
                  id="server-id"
                  name="id"
                  value={newMcpServer.id}
                  onChange={handleNewMcpServerChange}
                  className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm disabled:bg-gray-800 disabled:cursor-not-allowed"
                  placeholder="e.g., filesystem"
                  required
                  disabled={!!editingServerId} // Disable ID field when editing
                />
              </div>

              {/* Transport Selection */}
              <div className="mb-3">
                <label htmlFor="server-transport" className="block text-sm font-medium text-gray-300 mb-1">
                  Transport Type:
                </label>
                <select
                  id="server-transport"
                  name="transport"
                  value={newMcpServer.transport}
                  onChange={handleTransportChange}
                  disabled={useJsonInput} // Disable if using JSON input
                  className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-800"
                >
                  <option value="stdio">Standard I/O (stdio)</option>
                  <option value="sse">Server-Sent Events (SSE)</option>
                  <option value="streamableHttp">Streamable HTTP</option>
                </select>
              </div>

              {!useJsonInput ? (
                <>
                  {/* Stdio Specific Fields */}
                  {newMcpServer.transport === 'stdio' && (
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
                          required={newMcpServer.transport === 'stdio'}
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
                  )}

                  {/* SSE Specific Fields */}
                  {newMcpServer.transport === 'sse' && (
                    <div className="mb-3">
                      <label htmlFor="server-url-sse" className="block text-sm font-medium text-gray-300 mb-1">
                        SSE URL:
                      </label>
                      <input
                        type="url"
                        id="server-url-sse" // Unique ID
                        name="url"
                        value={newMcpServer.url}
                        onChange={handleNewMcpServerChange}
                        className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm"
                        placeholder="e.g., http://localhost:8000/sse"
                        required={newMcpServer.transport === 'sse'}
                      />
                       <p className="text-xs text-gray-400 mt-1">
                        Enter the full URL for the Server-Sent Events endpoint.
                       </p>
                    </div>
                  )}

                  {/* StreamableHTTP Specific Fields */}
                  {newMcpServer.transport === 'streamableHttp' && (
                    <div className="mb-3">
                      <label htmlFor="server-url-http" className="block text-sm font-medium text-gray-300 mb-1">
                        Streamable HTTP URL:
                      </label>
                      <input
                        type="url"
                        id="server-url-http" // Unique ID
                        name="url"
                        value={newMcpServer.url}
                        onChange={handleNewMcpServerChange}
                        className="w-full px-3 py-2 border border-gray-500 rounded-md bg-transparent text-white placeholder-gray-400 text-sm"
                        placeholder="e.g., http://localhost:8080/mcp"
                        required={newMcpServer.transport === 'streamableHttp'}
                      />
                       <p className="text-xs text-gray-400 mt-1">
                         Enter the full URL for the Streamable HTTP endpoint.
                       </p>
                    </div>
                  )}
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
                    placeholder={`{\n  "transport": "stdio",\n  "command": "npx",\n  "args": ["-y", "..."],\n  "env": { ... }\n}\n\n// OR\n\n{\n  "transport": "sse",\n  "url": "http://localhost:8000/sse"\n}\n\n// OR\n\n{\n  "transport": "streamableHttp",\n  "url": "http://localhost:8080/mcp"\n}`}
                    rows={10}
                  />
                  {jsonError && (
                    <p className="mt-1 text-sm text-red-400">{jsonError}</p>
                  )}
                </div>
              )}
              
              <div className="flex space-x-2 mt-4">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-primary hover:bg-primary/90 text-white rounded transition-colors text-sm"
                >
                  {editingServerId ? 'Update Server' : 'Add Server'}
                </button>
                {editingServerId && (
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors text-sm"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
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