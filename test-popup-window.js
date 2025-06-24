#!/usr/bin/env node

const { spawn } = require('child_process');
const os = require('os');

console.log('🪟 Testing Popup Window Context Capture');
console.log('=' .repeat(50));

function showTestInstructions() {
  const platform = os.platform();
  const hotkey = platform === 'darwin' ? 'Cmd+G' : 'Ctrl+G';
  
  console.log(`
🎯 **How to Test the Popup Window:**

1. **Start the app:**
   npm run dev

2. **Open any application** (VS Code, TextEdit, browser, etc.)

3. **Select some text** in that application

4. **Press ${hotkey}** - A popup window should appear with:
   ✅ The captured text displayed in a blue context banner
   ✅ "from [Application Name]" badge showing source app
   ✅ A chat interface ready for input
   ✅ Auto-focused input field

5. **Test different scenarios:**
   📝 Selected text (highest priority)
   📋 Clipboard content (if no text selected)
   🏷️  App context (if no text or clipboard)

🔧 **Popup Window Features:**
- Always on top of other windows
- Resizable (350-600px width, 400-800px height)
- Escape key to close
- Enter to send message
- Model selector in header
- Context can be used as input or dismissed
- Real-time streaming responses

🎨 **Expected Behavior:**
- Opens centered on screen (450x650px)
- Shows captured context at top
- Chat interface below
- Automatic focus on input
- One popup at a time (new ${hotkey} closes old popup)

🐛 **Troubleshooting:**
- If popup doesn't appear: Check console for errors
- If context not captured: Verify accessibility permissions (macOS)
- If hotkey not working: Check if another app uses ${hotkey}
- If styling broken: Check that Tailwind CSS is working

💡 **Test Content Examples:**

Copy/select this text and press ${hotkey}:

"This is test content for the popup window. The context capture system should detect this text and display it in the popup."

function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// This code should be captured and displayed in the popup

Dear team, this email content should also be captured when selected and ${hotkey} is pressed.

📊 **Success Criteria:**
✅ Popup opens when ${hotkey} is pressed
✅ Context is captured and displayed
✅ Source application is identified
✅ Chat interface works with streaming
✅ Window is properly sized and positioned
✅ Escape closes the popup
✅ Multiple ${hotkey} presses work correctly
  `);
}

function startDevMode() {
  console.log('\n🚀 Starting development mode...');
  console.log('The popup window system will be active.');
  console.log(`Press ${os.platform() === 'darwin' ? 'Cmd+G' : 'Ctrl+G'} from any app to test!\n`);

  const child = spawn('npm', ['run', 'dev'], { 
    stdio: 'inherit',
    shell: true
  });
  
  child.on('error', (error) => {
    console.error(`❌ Error starting dev mode: ${error.message}`);
  });
  
  return child;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node test-popup-window.js [command]

Commands:
  instructions  - Show detailed testing instructions
  dev          - Start app in development mode
  help         - Show this help message

Examples:
  node test-popup-window.js dev
  node test-popup-window.js instructions

🎯 Quick Test:
1. Run: node test-popup-window.js dev
2. Select text in any app
3. Press Cmd+G (Mac) or Ctrl+G (Windows/Linux)
4. Popup should appear with captured context!
`);
    return;
  }
  
  const command = args[0];
  
  switch (command) {
    case 'instructions':
      showTestInstructions();
      break;
    case 'dev':
      startDevMode();
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