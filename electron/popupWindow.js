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
    const initialPopupHeight = 100; // Height for just the input box
    
    // Position the popup at the bottom center of the screen
    const x = Math.round((screenWidth - popupWidth) / 2);
    const y = screenHeight - initialPopupHeight - 60; // 60px margin from bottom

    this.popupWindow = new BrowserWindow({
      width: popupWidth,
      height: initialPopupHeight,
      x: x,
      y: y,
      minWidth: 400,
      minHeight: initialPopupHeight,
      show: false, // Don't show until ready
      alwaysOnTop: true,
      skipTaskbar: true, // Don't show in taskbar
      resizable: false, // Not resizable initially
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false, // Remove frame to eliminate window controls
      transparent: true,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        enableRemoteModule: false
      }
    });

    // Determine URL based on environment
    const popupUrl = process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173/#/popup'
      : `file://${path.join(__dirname, '../dist/index.html')}#/popup`;

    this.popupWindow.loadURL(popupUrl);

    // Handle window events
    this.popupWindow.once('ready-to-show', () => {
      if (!this.popupWindow) {
        return; // Window was closed before it could be shown
      }
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
    /*
    this.popupWindow.on('blur', () => {
      // Optionally auto-close when losing focus
      this.closePopup();
    });
    */

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

  // Resize the popup window and reposition it to expand upwards
  resizePopup(width, height, resizable = true) {
    if (this.isOpen()) {
      const window = this.getPopupWindow();
      const { workAreaSize } = screen.getPrimaryDisplay();
      const bounds = window.getBounds();
      
      // New y position to expand upwards from bottom of screen
      const newY = workAreaSize.height - height - 60; // 60px margin from bottom

      window.setBounds({
        x: bounds.x - Math.round((width - bounds.width) / 2),
        y: newY,
        width,
        height,
      }, false); // Set animation to false for smoother resizing

      window.setResizable(resizable);
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