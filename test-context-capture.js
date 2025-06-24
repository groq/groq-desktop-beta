#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

console.log('🧪 Testing Global Context Capture System');
console.log('=' .repeat(50));

// Function to get the app executable path based on platform
function getAppPath() {
  const platform = os.platform();
  const appName = 'Groq Desktop';
  
  switch (platform) {
    case 'darwin': // macOS
      return `/Applications/${appName}.app/Contents/MacOS/${appName}`;
    case 'win32': // Windows
      return path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'groq-desktop-app', `${appName}.exe`);
    case 'linux':
      return `/usr/local/bin/groq-desktop-app`;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Function to create test content for context capture
function createTestContent() {
  const testTexts = [
    "This is a test text for context capture. Select this text and press Cmd+G (Mac) or Ctrl+G (Windows/Linux) to test the global hotkey context capture system.",
    
    `function calculateTotal(items) {
  let total = 0;
  for(let item of items) {
    total += item.price * item.quantity;
  }
  return total;
}

// Select this code and press the hotkey to test code context capture`,

    `Dear Team,

I hope this email finds you well. I wanted to follow up on our discussion regarding the new project requirements.

Please select this text and test the context capture functionality.

Best regards,
Test User`
  ];

  console.log('\n📝 Test Content Created:');
  console.log('=' .repeat(30));
  testTexts.forEach((text, index) => {
    console.log(`\n${index + 1}. ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
  });

  return testTexts;
}

// Function to start the app in development mode
function startAppInDev() {
  console.log('\n🚀 Starting app in development mode...');
  console.log('This will start the app with context capture enabled.');
  console.log('\nTo test:');
  console.log('1. Select some text in any application');
  console.log('2. Press Cmd+G (Mac) or Ctrl+G (Windows/Linux)');
  console.log('3. Check the console for captured context');
  
  const child = spawn('npm', ['run', 'dev'], { 
    stdio: 'inherit',
    shell: true
  });
  
  child.on('error', (error) => {
    console.error(`❌ Error starting app: ${error.message}`);
  });
  
  return child;
}

// Function to simulate different test scenarios
function showTestInstructions() {
  const platform = os.platform();
  const hotkey = platform === 'darwin' ? 'Cmd+G' : 'Ctrl+G';
  
  console.log('\n🎯 Test Scenarios:');
  console.log('=' .repeat(30));
  
  console.log(`\n1. **Selected Text Test:**
   - Select any text in any application
   - Press ${hotkey}
   - Context should be captured from selected text`);
   
  console.log(`\n2. **Clipboard Test:**
   - Copy text to clipboard (Cmd+C / Ctrl+C)
   - Press ${hotkey} without selecting anything
   - Context should be captured from clipboard`);
   
  console.log(`\n3. **Application Context Test:**
   - Open a specific app (e.g., VS Code, TextEdit, etc.)
   - Press ${hotkey} without selecting text
   - Context should include app name and window title`);

  console.log(`\n4. **Expected Context Structure:**
   {
     timestamp: 1234567890,
     text: "captured text content",
     title: "Window Title or Context Type",
     source: "Application Name",
     appName: "Application Name",
     contextType: "selected_text" | "clipboard" | "app_context"
   }`);

  console.log(`\n📋 Test Content for Copy/Paste:`);
  const testTexts = createTestContent();
  
  console.log(`\n💡 Tips:
   - Make sure the app has necessary permissions (accessibility on macOS)
   - Check the console output for captured context
   - Test with different applications and content types
   - The hotkey works globally, even when the app is in background`);
}

// Function to check system requirements
function checkSystemRequirements() {
  console.log('\n🔍 Checking System Requirements:');
  console.log('=' .repeat(30));
  
  const platform = os.platform();
  console.log(`Platform: ${platform}`);
  
  if (platform === 'darwin') {
    console.log(`
📱 macOS Requirements:
   - Accessibility permissions may be required
   - Go to System Preferences > Security & Privacy > Privacy > Accessibility
   - Add your Groq Desktop app to the list
   - This allows the app to capture selected text from other applications`);
  } else if (platform === 'linux') {
    console.log(`
🐧 Linux Requirements:
   - xclip or xsel for clipboard access
   - xprop for window information
   - Install with: sudo apt-get install xclip xsel x11-utils`);
  } else if (platform === 'win32') {
    console.log(`
🪟 Windows Requirements:
   - PowerShell access for system interactions
   - No additional permissions typically required`);
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node test-context-capture.js [command]

Commands:
  instructions  - Show detailed test instructions
  requirements  - Check system requirements
  dev          - Start app in development mode
  help         - Show this help message

Examples:
  node test-context-capture.js instructions
  node test-context-capture.js dev
  node test-context-capture.js requirements

🎯 Quick Test:
1. Run: node test-context-capture.js dev
2. Select text in any app
3. Press Cmd+G (Mac) or Ctrl+G (Windows/Linux)
4. Check console for captured context
`);
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'instructions':
      showTestInstructions();
      break;
    case 'requirements':
      checkSystemRequirements();
      break;
    case 'dev':
      startAppInDev();
      break;
    case 'help':
      main(); // Show help
      break;
    default:
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run without arguments to see available commands.');
  }
}

if (require.main === module) {
  main();
} 