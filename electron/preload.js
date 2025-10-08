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
      onReasoning: (callback) => {
        ipcRenderer.on('chat-stream-reasoning', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-reasoning', callback);
      },
      onToolExecution: (callback) => {
        ipcRenderer.on('chat-stream-tool-execution', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-tool-execution', callback);
      },
      onComplete: (callback) => {
        ipcRenderer.on('chat-stream-complete', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-complete', callback);
      },
      onError: (callback) => {
        ipcRenderer.on('chat-stream-error', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-error', callback);
      },
      onCancelled: (callback) => {
        ipcRenderer.on('chat-stream-cancelled', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-cancelled', callback);
      },
      onRetry: (callback) => {
        ipcRenderer.on('chat-stream-retry', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('chat-stream-retry', callback);
      },
      cleanup: () => {
        ipcRenderer.removeAllListeners('chat-stream-start');
        ipcRenderer.removeAllListeners('chat-stream-content');
        ipcRenderer.removeAllListeners('chat-stream-tool-calls');
        ipcRenderer.removeAllListeners('chat-stream-reasoning');
        ipcRenderer.removeAllListeners('chat-stream-tool-execution');
        ipcRenderer.removeAllListeners('chat-stream-complete');
        ipcRenderer.removeAllListeners('chat-stream-error');
        ipcRenderer.removeAllListeners('chat-stream-cancelled');
        ipcRenderer.removeAllListeners('chat-stream-retry');
      }
    };
  },
  
  // Stop chat stream
  stopChatStream: () => {
    ipcRenderer.send('stop-chat-stream');
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

  // --- Context Sharing Functions (Legacy - for URL/CLI context) ---
  getPendingContext: () => ipcRenderer.invoke('get-pending-context'),
  clearContext: () => ipcRenderer.invoke('clear-context'),
  onExternalContext: (callback) => {
    const listener = (event, context) => callback(context);
    ipcRenderer.on('external-context', listener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener('external-context', listener);
  },

  // --- Context Capture Functions (New - for global hotkey context) ---
  getCapturedContext: () => ipcRenderer.invoke('get-captured-context'),
  clearCapturedContext: () => ipcRenderer.invoke('clear-captured-context'),
  triggerContextCapture: () => ipcRenderer.invoke('trigger-context-capture'),
  captureManualContext: (text, title, source) => ipcRenderer.invoke('capture-manual-context', text, title, source),
  
  // Event listener for context captured via global hotkey
  onContextCaptured: (callback) => {
    const listener = (event, context) => callback(context);
    ipcRenderer.on('context-captured', listener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener('context-captured', listener);
  },

  // --- Popup Window Functions ---
  closePopup: () => ipcRenderer.invoke('close-popup'),
  isPopupOpen: () => ipcRenderer.invoke('is-popup-open'),
  
  // Event listener for popup context (sent when popup opens with context)
  onPopupContext: (callback) => {
    const listener = (event, context) => callback(context);
    ipcRenderer.on('popup-context', listener);
    // Return a function to remove the listener
    return () => ipcRenderer.removeListener('popup-context', listener);
  },

  // Other?
  sendToMain: (channel, data) => ipcRenderer.send(channel, data),
  
  // Custom context menu
  showContextMenu: (items) => ipcRenderer.send('show-context-menu', items),

  // Popup window management
  resizePopup: (width, height, resizable) => ipcRenderer.invoke('resize-popup', { width, height, resizable }),

  // Tool-related IPC
  onToolCall: (callback) => {
    ipcRenderer.on('tool-call', (event, ...args) => callback(...args));
  },

  // Autocomplete
  getAutocompleteSuggestion: (options) => ipcRenderer.invoke('autocomplete:get-suggestion', options),

  // Generic IPC renderer access (kept for backward compatibility)
  ipcRenderer: {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  },
}); 