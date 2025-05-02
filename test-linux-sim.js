// Simulate Linux platform for testing
process.platform = 'linux';
process.env.HOME = '/home/user';
process.env.PATH = '/usr/local/bin:/usr/bin:/bin:/home/user/.local/bin';

// Import necessary modules
const path = require('path');
const fs = require('fs');

console.log('=== Simulating Linux Platform ===');
console.log('Platform:', process.platform);
console.log('PATH separator:', path.delimiter);
console.log('HOME:', process.env.HOME);

// Get platform-specific file extension and prefix for script files
const getScriptInfo = () => {
  if (process.platform === 'win32') {
    return {
      ext: process.env.SHELL && process.env.SHELL.includes('powershell') ? '.ps1' : '.cmd',
      prefix: ''
    };
  } else if (process.platform === 'linux') {
    return {
      ext: '.sh',
      prefix: '-linux'
    };
  } else {
    return {
      ext: '.sh',
      prefix: ''
    };
  }
};

const scriptInfo = getScriptInfo();
console.log('Script extension:', scriptInfo.ext);
console.log('Script prefix:', scriptInfo.prefix);

// Test PATH construction
let requiredPaths = [];
if (process.platform === 'win32') {
  // Windows paths
  requiredPaths = [
    process.env.SystemRoot ? `${process.env.SystemRoot}\\System32` : 'SystemRoot not set',
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\.deno\\bin` : 'USERPROFILE not set'
  ];
} else if (process.platform === 'linux') {
  // Linux paths
  requiredPaths = [
    '/usr/local/bin',
    '/usr/bin',
    process.env.HOME ? `${process.env.HOME}/.deno/bin` : 'HOME not set',
    process.env.HOME ? `${process.env.HOME}/.local/bin` : 'HOME not set',
  ];
} else {
  // macOS paths
  requiredPaths = [
    '/usr/local/bin',
    '/usr/bin',
    process.env.HOME ? `${process.env.HOME}/.deno/bin` : 'HOME not set',
    '/opt/homebrew/bin'
  ];
}

console.log('\nRequired paths for Linux:');
requiredPaths.forEach(p => console.log(`- ${p}`));

// Test command resolution paths
const commandsToTest = ['node', 'npm', 'deno', 'docker', 'python'];
console.log('\nSimulated command resolution for Linux:');
commandsToTest.forEach(cmd => {
  const scriptName = `run-${cmd}${scriptInfo.prefix}${scriptInfo.ext}`;
  console.log(`${cmd} -> ${scriptName}`);
  
  // Check if the script exists
  const scriptPath = path.join(__dirname, 'electron', 'scripts', scriptName);
  const exists = fs.existsSync(scriptPath);
  console.log(`  - Script exists: ${exists ? '✅' : '❌'}`);
});

// Check for Windows scripts as well
console.log('\nChecking Windows scripts:');
['cmd', 'ps1'].forEach(ext => {
  const count = fs.readdirSync(path.join(__dirname, 'electron', 'scripts'))
    .filter(file => file.endsWith(`.${ext}`)).length;
  console.log(`- Found ${count} .${ext} files`);
});

console.log('\nTest complete!')