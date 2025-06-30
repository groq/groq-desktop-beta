const { globalShortcut, clipboard } = require('electron');
const { exec } = require('child_process');
const os = require('os');

class ContextCapture {
  constructor() {
    this.isRegistered = false;
    this.onContextCaptured = null;
  }

  // Register global hotkey (Cmd+G on Mac, Ctrl+G on Windows/Linux)
  registerGlobalHotkey(callback) {
    if (this.isRegistered) {
      console.log('Global hotkey already registered');
      return true;
    }

    this.onContextCaptured = callback;
    const accelerator = process.platform === 'darwin' ? 'Control+G' : 'Control+G';

    const success = globalShortcut.register(accelerator, () => {
      console.log(`Global hotkey ${accelerator} pressed`);
      this.captureContext();
    });

    if (success) {
      this.isRegistered = true;
      console.log(`Global hotkey ${accelerator} registered successfully`);
    } else {
      console.error(`Failed to register global hotkey ${accelerator}`);
    }

    return success;
  }

  // Unregister global hotkey
  unregisterGlobalHotkey() {
    if (this.isRegistered) {
      globalShortcut.unregisterAll();
      this.isRegistered = false;
      console.log('Global hotkey unregistered');
    }
  }

  // Main context capture function
  async captureContext() {
    try {
      console.log('Capturing context from active application...');
      
      const context = {
        timestamp: Date.now(),
        source: null,
        text: null,
        title: null,
        appName: null,
        contextType: null
      };

      // Try multiple context capture methods
      const captureResults = await Promise.allSettled([
        this.getSelectedText(),
        this.getClipboardContent(),
        this.getActiveApplication(),
        this.getWindowTitle()
      ]);

      // Process results
      const selectedText = captureResults[0].status === 'fulfilled' ? captureResults[0].value : null;
      const clipboardText = captureResults[1].status === 'fulfilled' ? captureResults[1].value : null;
      const activeApp = captureResults[2].status === 'fulfilled' ? captureResults[2].value : null;
      const windowTitle = captureResults[3].status === 'fulfilled' ? captureResults[3].value : null;

      // Determine best context
      if (selectedText && selectedText.trim()) {
        context.text = selectedText.trim();
        context.contextType = 'selected_text';
        context.title = windowTitle || 'Selected Text';
      } else if (clipboardText && clipboardText.trim()) {
        context.text = clipboardText.trim();
        context.contextType = 'clipboard';
        context.title = 'Clipboard Content';
      } else {
        // Fallback: try to get some context
        context.text = `Context captured from ${activeApp || 'unknown application'}`;
        context.contextType = 'app_context';
        context.title = windowTitle || 'Application Context';
      }

      context.appName = activeApp;
      context.source = activeApp || 'Unknown Application';

      console.log('Context captured:', {
        type: context.contextType,
        length: context.text?.length || 0,
        app: context.appName
      });

      // Call the callback with captured context
      if (this.onContextCaptured) {
        this.onContextCaptured(context);
      }

      return context;
    } catch (error) {
      console.error('Error capturing context:', error);
      
      // Fallback context
      const fallbackContext = {
        timestamp: Date.now(),
        text: 'Unable to capture context automatically. Please paste or type your content.',
        title: 'Context Capture Failed',
        source: 'System',
        contextType: 'fallback',
        error: error.message
      };

      if (this.onContextCaptured) {
        this.onContextCaptured(fallbackContext);
      }

      return fallbackContext;
    }
  }

  // Get selected text (platform-specific)
  async getSelectedText() {
    return new Promise((resolve, reject) => {
      const platform = os.platform();
      
      if (platform === 'darwin') {
        // macOS: Use AppleScript to get selected text
        const script = `
          tell application "System Events"
            set frontApp to name of first process whose frontmost is true
            tell process frontApp
              try
                keystroke "c" using command down
                delay 0.1
                return the clipboard
              on error
                return ""
              end try
            end tell
          end tell
        `;
        
        exec(`osascript -e '${script}'`, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.trim());
          }
        });
      } else if (platform === 'linux') {
        // Linux: Try xclip or xsel
        exec('xclip -selection primary -o', (error, stdout) => {
          if (error) {
            // Try xsel as fallback
            exec('xsel --primary --output', (error2, stdout2) => {
              if (error2) {
                reject(error2);
              } else {
                resolve(stdout2.trim());
              }
            });
          } else {
            resolve(stdout.trim());
          }
        });
      } else if (platform === 'win32') {
        // Windows: Use PowerShell to simulate Ctrl+C and get clipboard
        const script = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.SendKeys]::SendWait('^c')
          Start-Sleep -Milliseconds 100
          Get-Clipboard
        `;
        
        exec(`powershell -Command "${script}"`, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.trim());
          }
        });
      } else {
        reject(new Error(`Unsupported platform: ${platform}`));
      }
    });
  }

  // Get clipboard content
  async getClipboardContent() {
    return new Promise((resolve) => {
      try {
        const text = clipboard.readText();
        resolve(text);
      } catch (error) {
        console.error('Error reading clipboard:', error);
        resolve('');
      }
    });
  }

  // Get active application name
  async getActiveApplication() {
    return new Promise((resolve, reject) => {
      const platform = os.platform();
      
      if (platform === 'darwin') {
        const script = `
          tell application "System Events"
            set frontApp to name of first process whose frontmost is true
            return frontApp
          end tell
        `;
        
        exec(`osascript -e '${script}'`, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.trim());
          }
        });
      } else if (platform === 'linux') {
        exec('xprop -id $(xprop -root 32x \'\\t$0\' _NET_ACTIVE_WINDOW | cut -f 2) WM_CLASS', (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            const match = stdout.match(/WM_CLASS\(STRING\) = "([^"]+)"/);
            resolve(match ? match[1] : 'Unknown');
          }
        });
      } else if (platform === 'win32') {
        const script = `
          Add-Type -TypeDefinition '
            using System;
            using System.Diagnostics;
            using System.Runtime.InteropServices;
            public class Win32 {
              [DllImport("user32.dll")]
              public static extern IntPtr GetForegroundWindow();
              [DllImport("user32.dll")]
              public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
            }
          '
          $hwnd = [Win32]::GetForegroundWindow()
          $processId = 0
          [Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId)
          $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
          if ($process) { $process.ProcessName } else { "Unknown" }
        `;
        
        exec(`powershell -Command "${script}"`, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.trim());
          }
        });
      } else {
        reject(new Error(`Unsupported platform: ${platform}`));
      }
    });
  }

  // Get window title
  async getWindowTitle() {
    return new Promise((resolve, reject) => {
      const platform = os.platform();
      
      if (platform === 'darwin') {
        const script = `
          tell application "System Events"
            set frontApp to name of first process whose frontmost is true
            tell process frontApp
              try
                set windowTitle to title of front window
                return windowTitle
              on error
                return frontApp
              end try
            end tell
          end tell
        `;
        
        exec(`osascript -e '${script}'`, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.trim());
          }
        });
      } else if (platform === 'linux') {
        exec('xprop -id $(xprop -root 32x \'\\t$0\' _NET_ACTIVE_WINDOW | cut -f 2) _NET_WM_NAME', (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            const match = stdout.match(/_NET_WM_NAME\(UTF8_STRING\) = "([^"]+)"/);
            resolve(match ? match[1] : 'Unknown Window');
          }
        });
      } else if (platform === 'win32') {
        const script = `
          Add-Type -TypeDefinition '
            using System;
            using System.Runtime.InteropServices;
            using System.Text;
            public class Win32 {
              [DllImport("user32.dll")]
              public static extern IntPtr GetForegroundWindow();
              [DllImport("user32.dll")]
              public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
            }
          '
          $hwnd = [Win32]::GetForegroundWindow()
          $title = New-Object System.Text.StringBuilder 256
          [Win32]::GetWindowText($hwnd, $title, $title.Capacity)
          return $title.ToString()
        `;
        
        exec(`powershell -Command "${script}"`, (error, stdout) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout.trim());
          }
        });
      } else {
        reject(new Error(`Unsupported platform: ${platform}`));
      }
    });
  }

  // Manual context capture (for testing)
  async captureManualContext(text, title = null, source = null) {
    const context = {
      timestamp: Date.now(),
      text: text,
      title: title || 'Manual Context',
      source: source || 'Manual Input',
      contextType: 'manual',
      appName: source
    };

    if (this.onContextCaptured) {
      this.onContextCaptured(context);
    }

    return context;
  }
}

module.exports = ContextCapture; 