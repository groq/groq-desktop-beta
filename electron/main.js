const { app } = require('electron');
const fs   = require('fs');
const path = require('path');

// Create ~/Library/Logs/Groq Desktop if it does not exist
app.setAppLogsPath();
const logFile = path.join(app.getPath('logs'), 'main.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

// Mirror every console.* call to the file
['log', 'info', 'warn', 'error'].forEach(fn => {
  const orig = console[fn].bind(console);
  console[fn] = (...args) => {
    orig(...args);
    logStream.write(args.map(String).join(' ') + '\n');
  };
});

console.log('Groq Desktop started, logging to', logFile);

// Import necessary Electron modules
const { BrowserWindow, ipcMain, screen, shell } = require('electron');

// Import shared models
const { MODEL_CONTEXT_SIZES } = require('../shared/models.js');

// Import handlers
const chatHandler = require('./chatHandler');
const toolHandler = require('./toolHandler');

// Import new manager modules
const { initializeSettingsHandlers, loadSettings } = require('./settingsManager');
const { initializeCommandResolver, resolveCommandPath } = require('./commandResolver');
const mcpManager = require('./mcpManager');
const { initializeWindowManager } = require('./windowManager');
const authManager = require('./authManager');

// Import context capture system
const ContextCapture = require('./contextCapture');
const PopupWindowManager = require('./popupWindow');

// Global variable to hold the main window instance
let mainWindow;

// Variable to hold loaded model context sizes
let modelContextSizes = {};

// --- Context Sharing State ---
let pendingContext = null; // Holds context to be passed to renderer
let contextCapture = null; // Context capture instance
let lastCapturedContext = null; // Store the most recent captured context
let popupWindowManager = null; // Popup window manager instance

// --- Context Sharing Functions ---
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const context = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--context' && i + 1 < args.length) {
      context.text = args[i + 1];
      i++; // Skip next argument as it's the context value
    } else if (arg === '--context-file' && i + 1 < args.length) {
      const filePath = args[i + 1];
      try {
        if (fs.existsSync(filePath)) {
          context.text = fs.readFileSync(filePath, 'utf8');
          context.source = `File: ${filePath}`;
        }
      } catch (error) {
        console.error(`Error reading context file ${filePath}:`, error);
      }
      i++; // Skip next argument
    } else if (arg === '--context-title' && i + 1 < args.length) {
      context.title = args[i + 1];
      i++; // Skip next argument
    }
  }
  
  return Object.keys(context).length > 0 ? context : null;
}

function handleUrlProtocol(url) {
  // Handle groq://context?text=...&title=... URLs
  if (!url.startsWith('groq://')) return null;
  
  try {
    const urlObj = new URL(url);
    if (urlObj.pathname === '/context') {
      const context = {};
      
      if (urlObj.searchParams.has('text')) {
        context.text = decodeURIComponent(urlObj.searchParams.get('text'));
      }
      if (urlObj.searchParams.has('title')) {
        context.title = decodeURIComponent(urlObj.searchParams.get('title'));
      }
      if (urlObj.searchParams.has('source')) {
        context.source = decodeURIComponent(urlObj.searchParams.get('source'));
      }
      
      return Object.keys(context).length > 0 ? context : null;
    }
  } catch (error) {
    console.error('Error parsing URL protocol:', error);
  }
  
  return null;
}

function setContextForRenderer(context) {
  pendingContext = context;
  
  // If main window is already created, send the context immediately
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('external-context', context);
  }
}

// --- Context Capture Functions ---
function initializeContextCapture() {
  contextCapture = new ContextCapture();
  popupWindowManager = new PopupWindowManager();
  
  // Register global hotkey with callback that opens popup
  const success = contextCapture.registerGlobalHotkey((capturedContext) => {
    console.log('Context captured via global hotkey:', capturedContext);
    lastCapturedContext = capturedContext;
    
    // Open popup window with captured context
    try {
      popupWindowManager.createPopupWindow(capturedContext);
      console.log('Popup window opened with context from:', capturedContext.source);
    } catch (error) {
      console.error('Error opening popup window:', error);
    }
    
    // Also notify main window if it exists (for legacy support)
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('context-captured', capturedContext);
    }
  });
  
  if (!success) {
    console.error('Failed to register global hotkey for context capture');
  }
  
  return success;
}

function cleanupContextCapture() {
  if (contextCapture) {
    contextCapture.unregisterGlobalHotkey();
    contextCapture = null;
  }
  
  if (popupWindowManager) {
    popupWindowManager.closePopup();
    popupWindowManager = null;
  }
}

// Register URL protocol handler
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('groq', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('groq');
}

// Handle protocol on Windows/Linux
app.on('second-instance', (event, commandLine, workingDirectory) => {
  // Someone tried to run a second instance, focus our window instead
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  
  // Check if there's a protocol URL in the command line
  const protocolUrl = commandLine.find(arg => arg.startsWith('groq://'));
  if (protocolUrl) {
    const context = handleUrlProtocol(protocolUrl);
    if (context) {
      console.log('Received context from protocol URL:', context);
      setContextForRenderer(context);
    }
  }
});

// Handle protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  const context = handleUrlProtocol(url);
  if (context) {
    console.log('Received context from protocol URL:', context);
    setContextForRenderer(context);
  }
});

// App initialization sequence
app.whenReady().then(async () => {
  console.log("App Ready. Initializing...");

  // Parse command line arguments for context
  const cliContext = parseCommandLineArgs();
  if (cliContext) {
    console.log('Received context from command line:', cliContext);
    setContextForRenderer(cliContext);
  }

  // Initialize command resolver first (might be needed by others)
  initializeCommandResolver(app);

  // Load model context sizes from the JS module
  try {
    modelContextSizes = MODEL_CONTEXT_SIZES;
    console.log('Successfully loaded shared model definitions.');
  } catch (error) {
    console.error('Failed to load shared model definitions:', error);
    modelContextSizes = { 'default': { context: 8192, vision_supported: false } }; // Fallback
  }

  // Initialize window manager and get the main window instance
  mainWindow = initializeWindowManager(app, screen, shell, BrowserWindow);
  if (!mainWindow) {
      console.error("Fatal: Main window could not be created. Exiting.");
      app.quit();
      return;
  }

  // When the main window is closed, deregister its reference
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send pending context to renderer if available
  if (pendingContext) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('external-context', pendingContext);
    });
  }

  // Initialize context capture system
  const contextCaptureSuccess = initializeContextCapture();
  if (contextCaptureSuccess) {
    console.log('Context capture system initialized successfully');
    console.log('Press Cmd+G (Mac) or Ctrl+G (Windows/Linux) from any app to open popup with context');
  } else {
    console.warn('Context capture system failed to initialize');
  }

  // Initialize settings handlers (needs app)
  initializeSettingsHandlers(ipcMain, app);

  // Initialize MCP handlers (use module object)
  mcpManager.initializeMcpHandlers(ipcMain, app, mainWindow, loadSettings, resolveCommandPath);

  // Initialize Auth Manager (check will now work)
  console.log("[Main Init] Initializing Auth Manager...");
  if (mcpManager && typeof mcpManager.retryConnectionAfterAuth === 'function') {
      authManager.initialize(mcpManager.retryConnectionAfterAuth);
  } else {
       console.error("[Main] CRITICAL: mcpManager or retryConnectionAfterAuth not available for AuthManager initialization!");
  }

  // --- Register Core App IPC Handlers --- //
  // Chat completion (use module object)
  ipcMain.on('chat-stream', async (event, messages, model) => {
    const currentSettings = loadSettings();
    const { discoveredTools } = mcpManager.getMcpState(); // Use module object
    chatHandler.handleChatStream(event, messages, model, currentSettings, modelContextSizes, discoveredTools);
  });

  // Tool execution (use module object)
  console.log("[Main Init] Registering execute-tool-call...");
  ipcMain.handle('execute-tool-call', async (event, toolCall) => {
    const { discoveredTools, mcpClients } = mcpManager.getMcpState(); // Use module object
    return toolHandler.handleExecuteToolCall(event, toolCall, discoveredTools, mcpClients);
  });

  // Handler for getting model configurations
  ipcMain.handle('get-model-configs', async () => {
      // Return a copy to prevent accidental modification
      return JSON.parse(JSON.stringify(modelContextSizes));
  });

  // --- Context Sharing IPC Handlers (Legacy - for URL/CLI context) ---
  ipcMain.handle('get-pending-context', async () => {
    const context = pendingContext;
    pendingContext = null; // Clear after retrieval
    return context;
  });

  ipcMain.handle('clear-context', async () => {
    pendingContext = null;
  });

  // --- Context Capture IPC Handlers (for modal and popup) ---
  ipcMain.handle('get-captured-context', async () => {
    // Return the most recently captured context
    const context = lastCapturedContext;
    // Don't clear automatically for popup usage
    return context;
  });

  ipcMain.handle('clear-captured-context', async () => {
    lastCapturedContext = null;
  });

  ipcMain.handle('trigger-context-capture', async () => {
    // Manually trigger context capture (useful for testing)
    if (contextCapture) {
      return await contextCapture.captureContext();
    }
    return null;
  });

  ipcMain.handle('capture-manual-context', async (event, text, title, source) => {
    // Allow manual context input
    if (contextCapture) {
      return await contextCapture.captureManualContext(text, title, source);
    }
    return null;
  });

  // --- Popup Window IPC Handlers ---
  ipcMain.handle('close-popup', async () => {
    if (popupWindowManager) {
      popupWindowManager.closePopup();
    }
  });

  ipcMain.handle('is-popup-open', async () => {
    return popupWindowManager ? popupWindowManager.isOpen() : false;
  });

  ipcMain.handle('resize-popup', (event, { width, height, resizable }) => {
    if (popupWindowManager) {
      popupWindowManager.resizePopup(width, height, resizable);
    }
  });

  // --- Auth IPC Handler ---
  ipcMain.handle('start-mcp-auth-flow', async (event, { serverId, serverUrl }) => {
      if (!serverId || !serverUrl) {
          throw new Error("Missing serverId or serverUrl for start-mcp-auth-flow");
      }
      try {
          console.log(`[Main] Handling start-mcp-auth-flow for ${serverId}`);
          const result = await authManager.initiateAuthFlow(serverId, serverUrl);
          return result;
      } catch (error) {
          console.error(`[Main] Error handling start-mcp-auth-flow for ${serverId}:`, error);
          throw error;
      }
  });

  // --- Post-initialization Tasks --- //
  setTimeout(() => {
      mcpManager.connectConfiguredMcpServers(); // Use module object
  }, 1000);

  console.log("Initialization complete.");
});

// Make sure we handle single instance properly
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  // Continue with app initialization
}

// Clean up context capture on app quit
app.on('before-quit', () => {
  cleanupContextCapture();
});

// Note: App lifecycle events (window-all-closed, activate) are now handled by windowManager.js

// Keep any essential top-level error handling or logging if needed
process.on('uncaughtException', (error) => {
    console.error('Unhandled Exception:', error);
    // Optionally: Log to file, show dialog, etc.
});