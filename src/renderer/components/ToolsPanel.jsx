import React, { useState, useEffect } from 'react';
import LogViewerModal from './LogViewerModal';

function ToolsPanel({ tools = [], onClose, onDisconnectServer, onReconnectServer }) {
  const [expandedTools, setExpandedTools] = useState({});
  const [configuredServers, setConfiguredServers] = useState([]);
  const [serverStatuses, setServerStatuses] = useState({});
  const [authRequiredServers, setAuthRequiredServers] = useState({});
  const [viewingLogsForServer, setViewingLogsForServer] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);

  useEffect(() => {
    const loadConfiguredServers = async () => {
      try {
        const settings = await window.electron.getSettings();
        if (settings && settings.mcpServers) {
          const servers = Object.entries(settings.mcpServers).map(([id, config]) => {
            // Determine transport type accurately
            let transportType = 'stdio'; // Default
            if (config.transport === 'sse') {
                transportType = 'sse';
            } else if (config.transport === 'streamableHttp') {
                transportType = 'streamableHttp';
            }

            return {
              id,
              command: transportType === 'stdio' ? config.command : undefined,
              args: transportType === 'stdio' ? (config.args || []) : [],
              url: (transportType === 'sse' || transportType === 'streamableHttp') ? config.url : undefined,
              transport: transportType // Store the correct transport type
            };
          });
          setConfiguredServers(servers);

          // Determine which servers are currently connected
          const statuses = {};
          servers.forEach(server => {
            // Check if there are tools from this server
            const hasToolsFromServer = tools.some(tool => tool.serverId === server.id);
            statuses[server.id] = hasToolsFromServer ? 'connected' : 'disconnected';
          });
          setServerStatuses(statuses);
        }
      } catch (error) {
        console.error('Error loading configured servers:', error);
      }
    };
    
    loadConfiguredServers();
  }, [tools]);

  // Listener for auth reconnect completion events from main process
  useEffect(() => {
    const removeListener = window.electron.onMcpAuthReconnectComplete?.((data) => {
      console.log('Received mcp-auth-reconnect-complete:', data);
      // Clear the action in progress only if it matches the completed server
      if (data && actionInProgress === data.serverId) {
        setActionInProgress(null);
        if (!data.success) {
             // Optionally show an error toast if reconnect failed after auth
             console.error(`Auth reconnect failed for ${data.serverId}: ${data.error}`);
             // Keep server disconnected, potentially reset authRequired flag?
             // setAuthRequiredServers(prev => ({ ...prev, [data.serverId]: true }));
        } else {
            // Success state is handled by the main status update driven by notifyMcpServerStatus
            // but we should clear the authRequired flag here
            setAuthRequiredServers(prev => {
                 const newState = { ...prev };
                 delete newState[data.serverId];
                 return newState;
            });
        }
      }
    });

    // Cleanup listener on unmount
    return () => {
      if (removeListener) removeListener();
    };
  }, [actionInProgress]); // Depend on actionInProgress to ensure correct serverId check

  // Add event listener for ESC key
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Clean up the event listener when the component unmounts
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const toggleToolExpand = (toolName) => {
    setExpandedTools(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  const handleDisconnect = async (serverId) => {
    if (!onDisconnectServer || serverStatuses[serverId] !== 'connected') return;
    
    setActionInProgress(serverId);
    try {
      const success = await onDisconnectServer(serverId);
      if (success) {
        setServerStatuses(prev => ({ ...prev, [serverId]: 'disconnected' }));
      }
    } catch (error) {
      console.error(`Error disconnecting from server ${serverId}:`, error);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReconnect = async (serverId) => {
    if (!onReconnectServer || serverStatuses[serverId] !== 'disconnected') return;
    
    setActionInProgress(serverId);
    try {
      const result = await onReconnectServer(serverId);

      if (result && result.requiresAuth) {
        console.warn(`Authorization required for server ${serverId}.`);
        setAuthRequiredServers(prev => ({ ...prev, [serverId]: true }));
        setServerStatuses(prev => ({ ...prev, [serverId]: 'disconnected' })); // Keep disconnected
        // Optionally: show a toast/notification to the user
      } else if (result && result.success) {
        console.log(`Successfully reconnected to server ${serverId}.`);
        setAuthRequiredServers(prev => {
          const newState = { ...prev };
          delete newState[serverId];
          return newState;
        });
        setServerStatuses(prev => ({ ...prev, [serverId]: 'connected' }));
      } else {
        // Handle explicit failure or unexpected result structure
        console.error(`Failed to reconnect to server ${serverId}:`, result?.error || 'Unknown reason');
        setServerStatuses(prev => ({ ...prev, [serverId]: 'disconnected' })); // Ensure disconnected
      }
    } catch (error) {
      console.error(`Error during reconnect handler for ${serverId}:`, error);
      setServerStatuses(prev => ({ ...prev, [serverId]: 'disconnected' })); // Ensure disconnected on catch
    } finally {
      setActionInProgress(null);
    }
  };

  const handleAuthorizeServer = async (serverId) => {
    const server = configuredServers.find(s => s.id === serverId);
    if (!server || server.transport === 'stdio' || !server.url) { // Only allow for SSE with URL
        console.error("Cannot start auth flow: server config is not SSE or URL missing for", serverId);
        // Show error message to user?
        return;
    }
    console.log(`Starting authorization flow for server ${serverId} at ${server.url}...`);
    setActionInProgress(serverId); // Show loading/indicator on the button
    try {
        // Send IPC message to main process
        await window.electron.startMcpAuthFlow({ serverId: server.id, serverUrl: server.url });
        console.log(`Authorization flow initiated for ${serverId}. Please follow browser instructions.`);
        // Keep actionInProgress until user tries to reconnect or main process sends completion signal
    } catch (error) {
        console.error(`Error initiating auth flow for ${serverId}:`, error);
        // Show error message to user?
        setActionInProgress(null);
    }
  };

  // Group tools by server
  const toolsByServer = (tools || []).reduce((acc, tool) => {
    const serverId = tool.serverId || 'unknown';
    if (!acc[serverId]) {
      acc[serverId] = [];
    }
    acc[serverId].push(tool);
    return acc;
  }, {});

  // Servers with no tools (disconnected)
  const disconnectedServers = configuredServers
    .filter(server => !toolsByServer[server.id])
    .map(server => server.id);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-gray-800 w-full max-w-3xl max-h-[80vh] rounded-lg shadow-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-700 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-white">Available Tools ({tools.length})</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {/* Show configured servers section */}
          {configuredServers.length > 0 && (
            <div className="mb-6">
              <h3 className="text-md font-semibold text-white mb-2">Configured MCP Servers</h3>
              <div className="border border-gray-700 rounded-md overflow-hidden mb-4">
                {configuredServers.map(server => (
                  <div key={server.id} className="p-3 border-b border-gray-700 last:border-b-0 bg-gray-900 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-gray-300 flex items-center">
                        {server.id}
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
                          serverStatuses[server.id] === 'connected' 
                            ? 'bg-green-500' 
                            : 'bg-red-500'
                        }`}>
                          {serverStatuses[server.id] === 'connected' ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {server.transport === 'sse' ? (
                          <div><span className="font-mono">Type: SSE | URL: {server.url || 'N/A'}</span></div>
                        ) : server.transport === 'streamableHttp' ? (
                          <div><span className="font-mono">Type: Streamable HTTP | URL: {server.url || 'N/A'}</span></div>
                        ) : (
                          <div><span className="font-mono">Type: Stdio | $ {server.command || 'N/A'} {server.args.join(' ')}</span></div>
                        )}
                      </div>
                    </div>
                    <div className="flex space-x-2 flex-shrink-0 ml-4">
                      {serverStatuses[server.id] === 'connected' && (
                        <button
                          onClick={() => setViewingLogsForServer({ id: server.id, transport: server.transport })}
                          disabled={actionInProgress === server.id}
                          className="text-gray-600 hover:text-gray-800 text-sm py-1 px-2 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
                          title="View Logs"
                        >
                          Logs
                        </button>
                      )}
                      {serverStatuses[server.id] === 'connected' ? (
                        <button
                          onClick={() => handleDisconnect(server.id)}
                          disabled={actionInProgress === server.id}
                          className="text-red-600 hover:text-red-800 text-sm py-1 px-2 bg-red-100 hover:bg-red-200 rounded disabled:opacity-50"
                        >
                          {actionInProgress === server.id ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                      ) : (
                        authRequiredServers[server.id] ? (
                          <button
                            onClick={() => handleAuthorizeServer(server.id)}
                            disabled={actionInProgress === server.id}
                            className="text-yellow-600 hover:text-yellow-800 text-sm py-1 px-2 bg-yellow-100 hover:bg-yellow-200 rounded disabled:opacity-50"
                          >
                            {actionInProgress === server.id ? 'Authorizing...' : 'Authorize'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReconnect(server.id)}
                            disabled={actionInProgress === server.id}
                            className="text-green-600 hover:text-green-800 text-sm py-1 px-2 bg-green-100 hover:bg-green-200 rounded disabled:opacity-50"
                          >
                            {actionInProgress === server.id ? 'Connecting...' : 'Reconnect'}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 italic">
                These servers are automatically started when the application launches.
                You can manage them in the settings.
              </p>
            </div>
          )}
        
          {/* Available tools section */}
          <h3 className="text-md font-semibold text-white mb-2">Available Tools by Server</h3>
          {Object.keys(toolsByServer).length === 0 ? (
            <p className="text-gray-400 text-center">No tools available. All configured servers are disconnected.</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(toolsByServer).map(([serverId, serverTools]) => (
                <div key={serverId} className="border border-gray-700 rounded-lg overflow-hidden">
                  <div className="p-3 bg-gray-600 flex justify-between items-center">
                    <h3 className="font-medium text-white">
                      Server: {serverId} ({serverTools.length} tools)
                    </h3>
                    {serverId !== 'unknown' && serverStatuses[serverId] === 'connected' && (
                      <button
                        onClick={() => handleDisconnect(serverId)}
                        disabled={actionInProgress === serverId}
                        className="text-sm text-red-600 hover:text-red-800 py-1 px-2 bg-red-100 hover:bg-red-200 rounded disabled:opacity-50"
                      >
                        {actionInProgress === serverId ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                    )}
                  </div>
                  
                  <div className="p-2 space-y-2">
                    {serverTools.map((tool) => (
                      <div 
                        key={tool.name} 
                        className="border border-gray-700 rounded-lg overflow-hidden"
                      >
                        <div 
                          className="p-3 bg-gray-700 flex justify-between items-center cursor-pointer"
                          onClick={() => toggleToolExpand(tool.name)}
                        >
                          <div>
                            <h3 className="font-medium text-white">{tool.name}</h3>
                            <p className="text-sm text-gray-400">
                              {tool.description?.substring(0, 100)}
                              {tool.description?.length > 100 ? '...' : ''}
                            </p>
                          </div>
                          <span className="text-gray-400">
                            {expandedTools[tool.name] ? '▼' : '▶'}
                          </span>
                        </div>
                        
                        {expandedTools[tool.name] && (
                          <div className="p-3 border-t border-gray-700">
                            <div className="mb-2">
                              <h4 className="font-medium text-sm text-gray-300 mb-1">Full Description:</h4>
                              <p className="text-gray-400 whitespace-pre-wrap">{tool.description}</p>
                            </div>
                            
                            <div>
                              <h4 className="font-medium text-sm text-gray-300 mb-1">Input Schema:</h4>
                              <pre className="bg-gray-900 p-2 rounded overflow-x-auto text-xs">
                                {JSON.stringify(tool.input_schema, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Close
          </button>
        </div>

        {viewingLogsForServer && (
          <LogViewerModal 
            serverId={viewingLogsForServer.id} 
            transportType={viewingLogsForServer.transport}
            onClose={() => setViewingLogsForServer(null)}
          />
        )}

      </div>
    </div>
  );
}

export default ToolsPanel; 
