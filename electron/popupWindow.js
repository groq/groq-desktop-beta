const { BrowserWindow, screen } = require('electron');
const path = require('path');

class PopupWindowManager {
  constructor() {
    this.popupWindow = null;
    this.isPopupOpen = false;
  }

  // Create and show the popup window
  createPopupWindow(capturedContext = null) {
    // Close existing popup if open
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.close();
    }

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    
    // Popup dimensions
    const popupWidth = 500;
    const popupHeight = 500;
    
    // Center the popup on screen
    const x = Math.round((screenWidth - popupWidth) / 2);
    const y = Math.round((screenHeight - popupHeight) / 2);

    this.popupWindow = new BrowserWindow({
      width: popupWidth,
      height: popupHeight,
      x: x,
      y: y,
      minWidth: 400,
      minHeight: 300,
      show: false, // Don't show until ready
      alwaysOnTop: true,
      skipTaskbar: true, // Don't show in taskbar
      resizable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        enableRemoteModule: false
      },
      // Make it look like a popup
      frame: true,
      transparent: false,
      hasShadow: true,
      vibrancy: process.platform === 'darwin' ? 'under-window' : undefined
    });

    // Determine URL based on environment
    const popupUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173/#/popup'
      : `file://${path.join(__dirname, '../dist/index.html')}#/popup`;

    this.popupWindow.loadURL(popupUrl);

    // Handle window events
    this.popupWindow.once('ready-to-show', () => {
      this.popupWindow.show();
      this.popupWindow.focus();
      this.isPopupOpen = true;
      
      // Send captured context to the popup once it's ready
      if (capturedContext) {
        this.popupWindow.webContents.send('popup-context', capturedContext);
      }
    });

    this.popupWindow.on('closed', () => {
      this.popupWindow = null;
      this.isPopupOpen = false;
    });

    // Handle popup losing focus (optional: could auto-close)
    this.popupWindow.on('blur', () => {
      // Optionally auto-close when losing focus
      // this.closePopup();
    });

    // Handle escape key to close
    this.popupWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        this.closePopup();
      }
    });

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      // Uncomment to debug popup
      // this.popupWindow.webContents.openDevTools({ mode: 'detach' });
    }

    console.log('Popup window created and will show with context');
    return this.popupWindow;
  }

  // Close the popup window
  closePopup() {
    if (this.popupWindow && !this.popupWindow.isDestroyed()) {
      this.popupWindow.close();
    }
  }

  // Check if popup is open
  isOpen() {
    return this.isPopupOpen && this.popupWindow && !this.popupWindow.isDestroyed();
  }

  // Get popup window instance
  getPopupWindow() {
    return this.popupWindow;
  }

  // Send data to popup
  sendToPopup(channel, data) {
    if (this.isOpen() && this.popupWindow.webContents) {
      this.popupWindow.webContents.send(channel, data);
    }
  }

  // Focus popup if open
  focusPopup() {
    if (this.isOpen()) {
      this.popupWindow.focus();
      this.popupWindow.show();
    }
  }
}

module.exports = PopupWindowManager; 