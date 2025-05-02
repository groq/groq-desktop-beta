// Test the commandResolver functionality with platform detection

const path = require('path');
const resolver = require('./electron/commandResolver');

// Mock app instance for initialization
const mockApp = {
  isPackaged: false,
  getAppPath: () => __dirname
};

// Initialize resolver
resolver.initializeCommandResolver(mockApp);

console.log('=== Testing Command Resolver ===');
console.log(`Current platform: ${process.platform}`);

// Commands to test
const commands = ['node', 'deno', 'npx', 'docker', 'uvx'];

// Test resolver on current platform
console.log('\nCommand resolution on current platform:');
commands.forEach(cmd => {
  try {
    const resolvedPath = resolver.resolveCommandPath(cmd);
    console.log(`${cmd} -> ${resolvedPath}`);
    // Check if the resolved path exists
    const isExpectedFormat = checkPathFormat(resolvedPath, process.platform);
    console.log(`  - Path format correct: ${isExpectedFormat ? '✅' : '❌'}`);
  } catch (error) {
    console.error(`Error resolving '${cmd}': ${error.message}`);
  }
});

// Function to check if path format matches expected platform format
function checkPathFormat(scriptPath, platform) {
  if (!scriptPath) return false;
  
  if (platform === 'win32') {
    // Windows should resolve to either .cmd or .ps1 scripts, or direct commands
    const baseName = path.basename(scriptPath);
    return baseName === scriptPath || // Direct command
           scriptPath.endsWith('.cmd') || 
           scriptPath.endsWith('.ps1');
  } else if (platform === 'linux') {
    // Linux should resolve to -linux.sh scripts or direct commands
    const baseName = path.basename(scriptPath);
    return baseName === scriptPath || // Direct command
           scriptPath.includes('-linux.sh');
  } else {
    // macOS should resolve to .sh scripts without -linux or direct commands
    const baseName = path.basename(scriptPath);
    return baseName === scriptPath || // Direct command
           (scriptPath.endsWith('.sh') && !scriptPath.includes('-linux'));
  }
}

console.log('\nTest complete!');