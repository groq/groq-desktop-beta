import React, { useState, useEffect } from 'react';
import LogViewerModal from './LogViewerModal';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import Switch from './ui/Switch';
import { cn } from '../lib/utils';

function ToolsPanel({ tools = [], onClose, onDisconnectServer, onReconnectServer }) {
  const [expandedTools, setExpandedTools] = useState({});
  const [configuredServers, setConfiguredServers] = useState([]);
  const [serverStatuses, setServerStatuses] = useState({});
  const [authRequiredServers, setAuthRequiredServers] = useState({});
  const [viewingLogsForServer, setViewingLogsForServer] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [disabledServers, setDisabledServers] = useState([]);

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

          // Load disabled servers list
          setDisabledServers(settings.disabledMcpServers || []);

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

  const handleToggleAutoStart = async (serverId, enabled) => {
    try {
      const settings = await window.electron.getSettings();
      let updatedDisabledServers = [...(settings.disabledMcpServers || [])];
      
      if (enabled) {
        // Remove from disabled list (enable auto-start)
        updatedDisabledServers = updatedDisabledServers.filter(id => id !== serverId);
      } else {
        // Add to disabled list (disable auto-start)
        if (!updatedDisabledServers.includes(serverId)) {
          updatedDisabledServers.push(serverId);
        }
      }
      
      const updatedSettings = {
        ...settings,
        disabledMcpServers: updatedDisabledServers
      };
      
      const result = await window.electron.saveSettings(updatedSettings);
      if (result.success) {
        setDisabledServers(updatedDisabledServers);
        console.log(`Auto-start ${enabled ? 'enabled' : 'disabled'} for server ${serverId}`);
      } else {
        console.error('Failed to save auto-start setting:', result.error);
      }
    } catch (error) {
      console.error('Error toggling auto-start:', error);
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
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
      <Card className="w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4 pt-4">
          <div className="space-y-0.5">
            <CardTitle className="text-xl">Available Tools</CardTitle>
            <CardDescription className="text-xs">
              {tools.length} tools available across {Object.keys(toolsByServer).length} connected servers
            </CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onClose}
            className="shrink-0 h-8 w-8"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto px-4 py-3">
          {/* Show configured servers section */}
          {configuredServers.length > 0 && (
            <div className="mb-4">
              <h3 className="text-base font-semibold mb-2">Configured MCP Servers</h3>
              <Card className="mb-3">
                <CardContent className="p-0">
                  {configuredServers.map((server, index) => (
                    <div key={server.id} className={cn(
                      "p-3 flex justify-between items-start gap-3",
                      index !== configuredServers.length - 1 && "border-b"
                    )}>
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{server.id}</span>
                          <Badge variant={serverStatuses[server.id] === 'connected' ? 'default' : 'secondary'} className="text-xs">
                            {serverStatuses[server.id] === 'connected' ? 'Connected' : 'Disconnected'}
                          </Badge>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">Auto-start:</span>
                            <Switch
                              checked={!disabledServers.includes(server.id)}
                              onChange={() => handleToggleAutoStart(server.id, disabledServers.includes(server.id))}
                              id={`autostart-${server.id}`}
                              size="sm"
                            />
                          </div>
                        </div>
                        <div className="space-y-0.5 text-xs text-muted-foreground">
                          {server.transport === 'sse' ? (
                            <>
                              <div><span className="font-mono">Type: SSE</span></div>
                              <div><span className="font-mono break-all">URL: {server.url || 'N/A'}</span></div>
                            </>
                          ) : server.transport === 'streamableHttp' ? (
                            <>
                              <div><span className="font-mono">Type: Streamable HTTP</span></div>
                              <div><span className="font-mono break-all">URL: {server.url || 'N/A'}</span></div>
                            </>
                          ) : (
                            <>
                              <div><span className="font-mono">Type: Stdio</span></div>
                              <div><span className="font-mono">Command: {server.command || 'N/A'}</span></div>
                              {server.args && server.args.length > 0 && (
                                <div><span className="font-mono break-all">Args: {server.args.join(' ')}</span></div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        {serverStatuses[server.id] === 'connected' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setViewingLogsForServer({ id: server.id, transport: server.transport })}
                            disabled={actionInProgress === server.id}
                            className="h-7 px-2 text-xs"
                          >
                            Logs
                          </Button>
                        )}
                        {serverStatuses[server.id] === 'connected' ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDisconnect(server.id)}
                            disabled={actionInProgress === server.id}
                            className="h-7 px-2 text-xs"
                          >
                            {actionInProgress === server.id ? 'Disconnecting...' : 'Disconnect'}
                          </Button>
                        ) : (
                          authRequiredServers[server.id] ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAuthorizeServer(server.id)}
                              disabled={actionInProgress === server.id}
                              className="h-7 px-2 text-xs border-yellow-300 text-yellow-700 hover:bg-yellow-50"
                            >
                              {actionInProgress === server.id ? 'Authorizing...' : 'Authorize'}
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleReconnect(server.id)}
                              disabled={actionInProgress === server.id}
                              className="h-7 px-2 text-xs"
                            >
                              {actionInProgress === server.id ? 'Connecting...' : 'Reconnect'}
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground mt-2">
                Toggle auto-start to control which servers connect automatically when the application launches.
                You can also manage server configurations in settings.
              </p>
            </div>
          )}
        
          {/* Available tools section */}
          <div className="space-y-2">
            <h3 className="text-base font-semibold">Available Tools by Server</h3>
            {Object.keys(toolsByServer).length === 0 ? (
              <Card>
                <CardContent className="text-center py-4 px-3">
                  <p className="text-sm text-muted-foreground">No tools available. All configured servers are disconnected.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {Object.entries(toolsByServer).map(([serverId, serverTools]) => (
                  <Card key={serverId}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3">
                      <CardTitle className="text-sm font-semibold">
                        Server: {serverId}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {serverTools.length} tools
                        </Badge>
                      </CardTitle>
                      {serverId !== 'unknown' && serverStatuses[serverId] === 'connected' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDisconnect(serverId)}
                          disabled={actionInProgress === serverId}
                        >
                          {actionInProgress === serverId ? 'Disconnecting...' : 'Disconnect'}
                        </Button>
                      )}
                    </CardHeader>
                    
                    <CardContent className="space-y-1.5 pt-2 px-3 pb-3">
                      {serverTools.map((tool) => (
                        <Card key={tool.name} className="overflow-hidden">
                          <div 
                            className="p-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
                            onClick={() => toggleToolExpand(tool.name)}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="space-y-0.5 flex-1 min-w-0">
                                <h4 className="font-medium text-sm">{tool.name}</h4>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {tool.description?.substring(0, 80)}
                                  {tool.description?.length > 80 ? '...' : ''}
                                </p>
                              </div>
                              <Button variant="ghost" size="sm" className="shrink-0 h-6 w-6 p-0">
                                {expandedTools[tool.name] ? '▼' : '▶'}
                              </Button>
                            </div>
                          </div>
                          
                          {expandedTools[tool.name] && (
                            <div className="border-t p-2.5 space-y-2 bg-muted/50">
                              <div>
                                <h5 className="font-medium text-xs mb-1">Full Description:</h5>
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{tool.description}</p>
                              </div>
                              
                              <div>
                                <h5 className="font-medium text-xs mb-1">Input Schema:</h5>
                                <pre className="bg-background p-2 rounded-md overflow-x-auto text-xs border">
                                  {JSON.stringify(tool.input_schema, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </Card>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
        
        <div className="flex items-center justify-end gap-2 px-4 pb-3 pt-2">
          <Button onClick={onClose} className="w-full" size="sm">
            Close
          </Button>
        </div>

        {viewingLogsForServer && (
          <LogViewerModal 
            serverId={viewingLogsForServer.id} 
            transportType={viewingLogsForServer.transport}
            onClose={() => setViewingLogsForServer(null)}
          />
        )}

      </Card>
    </div>
  );
}

export default ToolsPanel; 
