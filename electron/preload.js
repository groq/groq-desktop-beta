const { ipcRenderer, contextBridge } = require('electron');

// Chat stream channel names - centralized for consistency
const CHAT_STREAM_CHANNELS = [
  'chat-stream-start',
  'chat-stream-content',
  'chat-stream-tool-calls',
  'chat-stream-reasoning',
  'chat-stream-reasoning-summary',
  'chat-stream-tool-execution',
  'chat-stream-mcp-approval-request',
  'chat-stream-complete',
  'chat-stream-error',
  'chat-stream-cancelled',
  'chat-stream-retry'
];

// Clean up all chat stream listeners - call this before setting up new ones
// This prevents duplicate listeners from accumulating during HMR
function cleanupChatStreamListeners() {
  CHAT_STREAM_CHANNELS.forEach(channel => {
    ipcRenderer.removeAllListeners(channel);
  });
}

contextBridge.exposeInMainWorld('electron', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getSettingsPath: () => ipcRenderer.invoke('get-settings-path'),
  reloadSettings: () => ipcRenderer.invoke('reload-settings'),
  // Chat API - streaming only
  executeToolCall: (toolCall) => ipcRenderer.invoke('execute-tool-call', toolCall),
  
  // NOTE: sendMcpApprovalResponse removed - Groq does not yet support mcp_approval_response
  
  // Streaming API events
  startChatStream: (messages, model) => {
    // CRITICAL: Clean up any existing listeners BEFORE setting up new ones
    // This prevents duplicate responses when HMR reloads the renderer
    cleanupChatStreamListeners();
    
    // Start a new chat stream
    ipcRenderer.send('chat-stream', messages, model);
    
    // Track registered listeners so we can properly clean them up
    const registeredListeners = new Map();
    
    // Helper to create a listener that properly tracks the wrapper function
    const createListener = (channel) => (callback) => {
      // Create the wrapper function
      const wrapper = (_, data) => callback(data);
      // Store the wrapper so we can remove the exact function later
      if (!registeredListeners.has(channel)) {
        registeredListeners.set(channel, []);
      }
      registeredListeners.get(channel).push(wrapper);
      // Register the listener
      ipcRenderer.on(channel, wrapper);
      // Return cleanup function that removes this specific listener
      return () => {
        ipcRenderer.removeListener(channel, wrapper);
        const listeners = registeredListeners.get(channel);
        if (listeners) {
          const idx = listeners.indexOf(wrapper);
          if (idx !== -1) listeners.splice(idx, 1);
        }
      };
    };
    
    // Setup event listeners for streaming responses
    return {
      onStart: createListener('chat-stream-start'),
      onContent: createListener('chat-stream-content'),
      onToolCalls: createListener('chat-stream-tool-calls'),
      onReasoning: createListener('chat-stream-reasoning'),
      onReasoningSummary: createListener('chat-stream-reasoning-summary'),
      onToolExecution: createListener('chat-stream-tool-execution'),
      onMcpApprovalRequest: createListener('chat-stream-mcp-approval-request'),
      onComplete: createListener('chat-stream-complete'),
      onError: createListener('chat-stream-error'),
      onCancelled: createListener('chat-stream-cancelled'),
      onRetry: createListener('chat-stream-retry'),
      cleanup: () => {
        // Remove all listeners registered through this stream handler
        registeredListeners.forEach((listeners, channel) => {
          listeners.forEach(wrapper => {
            ipcRenderer.removeListener(channel, wrapper);
          });
        });
        registeredListeners.clear();
        // Also do a full cleanup to catch any stragglers
        cleanupChatStreamListeners();
      }
    };
  },
  
  // Stop chat stream
  stopChatStream: () => {
    ipcRenderer.send('stop-chat-stream');
  },
  
  // Clean up all chat stream listeners (useful for HMR and component unmount)
  cleanupChatStreamListeners: () => {
    cleanupChatStreamListeners();
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

  // Google OAuth
  googleOAuth: {
    refresh: () => ipcRenderer.invoke('google-oauth-refresh'),
    getStatus: () => ipcRenderer.invoke('google-oauth-status'),
    validate: () => ipcRenderer.invoke('google-oauth-validate'),
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

  // --- Chat History Functions ---
  chatHistory: {
    list: () => ipcRenderer.invoke('chat-history-list'),
    load: (chatId) => ipcRenderer.invoke('chat-history-load', chatId),
    create: (model, useResponsesApi) => ipcRenderer.invoke('chat-history-create', model, useResponsesApi),
    save: (chat) => ipcRenderer.invoke('chat-history-save', chat),
    updateMessages: (chatId, messages) => ipcRenderer.invoke('chat-history-update-messages', chatId, messages),
    updateTitle: (chatId, title) => ipcRenderer.invoke('chat-history-update-title', chatId, title),
    delete: (chatId) => ipcRenderer.invoke('chat-history-delete', chatId),
    generateTitle: (userMessage) => ipcRenderer.invoke('chat-history-generate-title', userMessage),
  },

  // Generic IPC renderer access (kept for backward compatibility)
  ipcRenderer: {
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  },
}); 