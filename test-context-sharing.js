#!/usr/bin/env node

const { exec, spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Test content
const testContent = {
  simple: "This is a test context from another application. Please analyze this text.",
  withTitle: {
    title: "Sample Document Analysis",
    text: "This document contains important information about user behavior patterns in our application. Users tend to engage more with features that provide immediate feedback. The data shows a 40% increase in user retention when interactive elements are present.",
    source: "Analytics Report"
  },
  code: {
    title: "Code Review Request",
    text: `function calculateTotal(items) {
  let total = 0;
  for(let item of items) {
    total += item.price * item.quantity;
  }
  return total;
}

// Please review this function for potential improvements`,
    source: "main.js"
  }
};

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
      return `/usr/local/bin/groq-desktop-app`; // or wherever it's installed
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

// Function to test command line context sharing
function testCommandLine(testName, content) {
  console.log(`\n🚀 Testing Command Line Context Sharing: ${testName}`);
  console.log('=' .repeat(50));
  
  const appPath = getAppPath();
  let args = [];
  
  if (typeof content === 'string') {
    args = ['--context', content];
  } else {
    args = ['--context', content.text];
    if (content.title) {
      args.push('--context-title', content.title);
    }
  }
  
  console.log(`Command: "${appPath}" ${args.join(' ')}`);
  console.log('\nExecuting...');
  
  const child = spawn(appPath, args, { 
    stdio: 'inherit',
    detached: true
  });
  
  child.on('error', (error) => {
    console.error(`❌ Error launching app: ${error.message}`);
    console.log('\n💡 Make sure the Groq Desktop app is installed and accessible at:');
    console.log(`   ${appPath}`);
  });
  
  child.on('spawn', () => {
    console.log('✅ App launched with context!');
    child.unref(); // Allow the parent process to exit
  });
}

// Function to test URL protocol context sharing
function testUrlProtocol(testName, content) {
  console.log(`\n🌐 Testing URL Protocol Context Sharing: ${testName}`);
  console.log('=' .repeat(50));
  
  let url = 'groq://context';
  const params = new URLSearchParams();
  
  if (typeof content === 'string') {
    params.append('text', content);
  } else {
    params.append('text', content.text);
    if (content.title) {
      params.append('title', content.title);
    }
    if (content.source) {
      params.append('source', content.source);
    }
  }
  
  url += '?' + params.toString();
  
  console.log(`URL: ${url}`);
  console.log('\nOpening URL...');
  
  // Use appropriate command based on platform
  const platform = os.platform();
  let command;
  
  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "${url}"`;
      break;
    case 'linux':
      command = `xdg-open "${url}"`;
      break;
    default:
      console.error(`❌ Unsupported platform: ${platform}`);
      return;
  }
  
  exec(command, (error) => {
    if (error) {
      console.error(`❌ Error opening URL: ${error.message}`);
      console.log('\n💡 Make sure the Groq Desktop app is installed and the groq:// protocol is registered.');
    } else {
      console.log('✅ URL opened successfully!');
    }
  });
}

// Function to create a file and test file context sharing
function testFileContext() {
  console.log(`\n📁 Testing File Context Sharing`);
  console.log('=' .repeat(50));
  
  const tempFile = path.join(os.tmpdir(), 'groq-test-context.txt');
  const fs = require('fs');
  
  fs.writeFileSync(tempFile, testContent.code.text);
  console.log(`Created temp file: ${tempFile}`);
  
  const appPath = getAppPath();
  const args = ['--context-file', tempFile, '--context-title', 'Code from File'];
  
  console.log(`Command: "${appPath}" ${args.join(' ')}`);
  console.log('\nExecuting...');
  
  const child = spawn(appPath, args, { 
    stdio: 'inherit',
    detached: true
  });
  
  child.on('error', (error) => {
    console.error(`❌ Error launching app: ${error.message}`);
  });
  
  child.on('spawn', () => {
    console.log('✅ App launched with file context!');
    child.unref();
    
    // Clean up temp file after a delay
    setTimeout(() => {
      try {
        fs.unlinkSync(tempFile);
        console.log(`🗑️  Cleaned up temp file: ${tempFile}`);
      } catch (e) {
        console.log(`ℹ️  Couldn't clean up temp file: ${e.message}`);
      }
    }, 5000);
  });
}

// Main function
function main() {
  console.log('🔧 Groq Desktop Context Sharing Test Script');
  console.log('=' .repeat(50));
  
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node test-context-sharing.js [test-type]

Test types:
  cli-simple     - Test command line with simple text
  cli-complex    - Test command line with title and structured content
  url-simple     - Test URL protocol with simple text
  url-complex    - Test URL protocol with complex content
  file           - Test file-based context sharing
  all            - Run all tests

Examples:
  node test-context-sharing.js cli-simple
  node test-context-sharing.js url-complex
  node test-context-sharing.js all

💡 Other apps can integrate with Groq Desktop using these methods:

1. Command Line Arguments:
   your-app --export | groq-desktop --context "$(cat -)"
   groq-desktop --context "Your text here" --context-title "Title"
   groq-desktop --context-file "/path/to/file.txt"

2. URL Protocol:
   groq://context?text=Hello%20World&title=My%20Title&source=MyApp

3. JavaScript (for Electron apps):
   const { shell } = require('electron');
   shell.openExternal('groq://context?text=' + encodeURIComponent(text));
`);
    return;
  }
  
  const testType = args[0];
  
  switch (testType) {
    case 'cli-simple':
      testCommandLine('Simple Text', testContent.simple);
      break;
    case 'cli-complex':
      testCommandLine('Complex Content', testContent.withTitle);
      break;
    case 'url-simple':
      testUrlProtocol('Simple Text', testContent.simple);
      break;
    case 'url-complex':
      testUrlProtocol('Complex Content', testContent.code);
      break;
    case 'file':
      testFileContext();
      break;
    case 'all':
      console.log('🎯 Running all tests...\n');
      testCommandLine('Simple CLI', testContent.simple);
      setTimeout(() => testCommandLine('Complex CLI', testContent.withTitle), 2000);
      setTimeout(() => testUrlProtocol('Simple URL', testContent.simple), 4000);
      setTimeout(() => testUrlProtocol('Complex URL', testContent.code), 6000);
      setTimeout(() => testFileContext(), 8000);
      break;
    default:
      console.error(`❌ Unknown test type: ${testType}`);
      console.log('Run without arguments to see available test types.');
  }
}

if (require.main === module) {
  main();
} 