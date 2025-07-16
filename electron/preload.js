const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSettingsPath: () => ipcRenderer.invoke('get-settings-path'),
  reloadSettings: () => ipcRenderer.invoke('reload-settings'),
  // Chat API - streaming only
  executeToolCall: (toolCall) => ipcRenderer.invoke('execute-tool-call', toolCall),
  
  // Streaming API events
  startChatStream: (messages, model) => {
    // Start a new chat stream
    ipcRenderer.send('chat-stream', messages, model);
    
    // Setup event listeners for streaming responses
    return {
      onStart: (callback) => {
        ipcRenderer.on('chat-stream-start', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-start', callback);
      },
      onContent: (callback) => {
        ipcRenderer.on('chat-stream-content', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-content', callback);
      },
      onToolCalls: (callback) => {
        ipcRenderer.on('chat-stream-tool-calls', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-tool-calls', callback);
      },
      onComplete: (callback) => {
        ipcRenderer.on('chat-stream-complete', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-complete', callback);
      },
      onError: (callback) => {
        ipcRenderer.on('chat-stream-error', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-error', callback);
      },
      cleanup: () => {
        ipcRenderer.removeAllListeners('chat-stream-start');
        ipcRenderer.removeAllListeners('chat-stream-content');
        ipcRenderer.removeAllListeners('chat-stream-tool-calls');
        ipcRenderer.removeAllListeners('chat-stream-complete');
        ipcRenderer.removeAllListeners('chat-stream-error');
      }
    };
  },
  
  // MCP related functions
  connectMcpServer: (serverConfig) => ipcRenderer.invoke('connect-mcp-server', serverConfig),
  disconnectMcpServer: (serverId) => ipcRenderer.invoke('disconnect-mcp-server', serverId),
  getMcpTools: () => ipcRenderer.invoke('get-mcp-tools'),
  // Function to get model configurations
  getModelConfigs: () => ipcRenderer.invoke('get-model-configs'),
  
  // Add event listener for MCP server status changes
  onMcpServerStatusChanged: (callback) => {
    const listener = (event, status) => callback(status);
    ipcRenderer.on('mcp-server-status-changed', listener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener('mcp-server-status-changed', listener);
  },
  
  // MCP Log Handling
  getMcpServerLogs: (serverId) => ipcRenderer.invoke('get-mcp-server-logs', serverId),
  onMcpLogUpdate: (callback) => {
    const listener = (event, { serverId, logChunk }) => callback(serverId, logChunk);
    ipcRenderer.on('mcp-log-update', listener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener('mcp-log-update', listener);
  },

  // Auth
  startMcpAuthFlow: (authParams) => ipcRenderer.invoke('start-mcp-auth-flow', authParams),
  onMcpAuthReconnectComplete: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('mcp-auth-reconnect-complete', listener);
    return () => ipcRenderer.removeListener('mcp-auth-reconnect-complete', listener);
  },

  // Other?
}); 