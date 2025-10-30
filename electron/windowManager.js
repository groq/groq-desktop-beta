const path = require('path');

let mainWindow; // Store the main window instance

function createWindow(screen, BrowserWindow) {
  const display = screen.getPrimaryDisplay();
  const { height, width } = display.workAreaSize;
  const bounds = display.bounds;

  const windowWidth = Math.min(1600, width);
  const windowHeight = height;

  // Calculate center position
  // Center horizontally in the full screen, vertically in the work area
  const x = bounds.x + Math.round((bounds.width - windowWidth) / 2);
  const y = bounds.y + Math.round((bounds.height - height) / 2);

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    maxWidth: 1600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // Assumes preload.js is in the same directory
    }
  });

  // Determine URL based on environment
  const startUrl = process.env.NODE_ENV === 'development'
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Open DevTools during development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log("Main window created.");
  return mainWindow;
}

function initializeWindowManager(app, screen, shell, BrowserWindow) {
    if (!app || !screen || !shell || !BrowserWindow) {
        console.error("WindowManager Initialization Error: Missing required Electron modules.");
        return null; // Indicate failure
    }

    console.log("WindowManager Initializing...");

    // Create the window when the app is ready (though it might be called later by main.js)
    // We return the created window, main.js stores it.
    const createdWindow = createWindow(screen, BrowserWindow);

    // Handle external links to open in default browser
    createdWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    // Handle clicked links in the app (prevent navigation away from app)
    createdWindow.webContents.on('will-navigate', (event, url) => {
      const startUrlDev = 'http://localhost:5173';
      const startUrlProd = `file://${path.join(__dirname, '../dist/index.html')}`;

      // Check if the URL is external
      if ((url.startsWith('http:') || url.startsWith('https:')) &&
           url !== startUrlDev && !url.startsWith(startUrlDev) && // Allow dev server navigation
           url !== startUrlProd) { // Allow prod file navigation
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    // App lifecycle events handled here
    /*
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
    */

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) {
        // Re-create the window using the original function (or potentially a simplified one)
        // Ensure mainWindow reference is updated if needed elsewhere
        mainWindow = createWindow(screen, BrowserWindow);
        // Note: mainWindow is module-scoped, so this updates the reference used internally.
        // If main.js needs the new instance, this module should perhaps emit an event or provide a getter.
      }
    });

    console.log("WindowManager Initialized and app lifecycle events attached.");
    return createdWindow; // Return the initially created window instance
}

// Optional: Provide a getter if other modules need the *current* mainWindow instance
// function getMainWindow() {
//     return mainWindow;
// }

module.exports = {
    initializeWindowManager,
    // getMainWindow
}; 