const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const process = require('process');

let isAppPackaged; // Store packaged status
let appInstance; // Store app instance for paths

// Helper function to get the correct base path for scripts
function getScriptsBasePath() {
  if (!appInstance) {
    console.error("App instance not initialized in commandResolver.");
    // Fallback to a potentially incorrect path, hoping __dirname is somewhat relevant
    return path.join(__dirname, 'scripts');
  }
  return isAppPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'scripts')
    : path.join(appInstance.getAppPath(), 'electron', 'scripts'); // Use app.getAppPath() for dev
}

// Helper function to check if a path exists
function checkPathExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (e) {
    // Ignore errors like permission denied
    return false;
  }
}

// Helper function to find a command using 'which' or 'where' (Windows)
function findCommandUsingWhich(command) {
  try {
    // Escape command to prevent injection issues if needed
    const safeCommand = command.replace(/[^a-zA-Z0-9_\-.]/g, ''); // Basic sanitization
    if (safeCommand !== command) {
        console.warn(`Command '${command}' sanitized to '${safeCommand}' for command lookup.`);
    }
    if (!safeCommand) return null; // Don't run lookup with empty string

    let commandPath;
    if (process.platform === 'win32') {
      // Use 'where' command on Windows
      commandPath = execSync(`where ${safeCommand}`).toString().trim().split('\r\n')[0]; // Use first result
    } else {
      // Use 'which' command on Unix-like systems
      commandPath = execSync(`which ${safeCommand}`).toString().trim();
    }

    if (commandPath && checkPathExists(commandPath)) {
      console.log(`Found ${command} using '${process.platform === 'win32' ? 'where' : 'which'}' at ${commandPath}`);
      return commandPath;
    }
  } catch (error) {
    // Silently fail if command lookup fails or path doesn't exist
    // console.error(`Command lookup for '${command}' failed:`, error.message); // Optional debug log
  }
  return null;
}

// Refactored function to resolve command paths
function resolveCommandPath(command) {
    if (!appInstance) {
        console.error("App instance not initialized in commandResolver. Cannot resolve command path.");
        return command; // Return original command as fallback
    }
  // If not a simple command name, return as is (likely already a path)
  if (!command || typeof command !== 'string' || command.includes('/') || command.includes('\\')) {
    return command;
  }

  // On Windows we prefer to invoke the command directly rather than a POSIX shell wrapper (.sh)
  // because those wrapper scripts are not executable in the default Windows environment.
  // This early return ensures that commands like "node" resolve to the command that should
  // already be available in the PATH instead of our helper shell script (run-node.sh), which
  // was designed for Unix-like systems. Trying to execute a .sh script on Windows causes the
  // transport process to exit immediately, leading to connection failures such as
  // "MCP error -32000: Connection closed".
  if (process.platform === 'win32') {
    return command;
  }

  const scriptBasePath = getScriptsBasePath(); // Use helper
  const homeDir = process.env.HOME || ''; // Get HOME dir

  // Base known paths
  const baseNpxPaths = ['/usr/local/bin/npx', '/usr/bin/npx'];
  const nvmNpxPaths = homeDir ? [
      `${homeDir}/.nvm/versions/node/v18/bin/npx`,
      `${homeDir}/.nvm/versions/node/v20/bin/npx`,
      `${homeDir}/.nvm/versions/node/v22/bin/npx`,
      `${homeDir}/.nvm/current/bin/npx`
  ] : [];

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

  // Define configurations for commands that might need special handling or scripts
  const specialCommands = {
    'npx': {
      scriptName: `run-npx${scriptInfo.prefix}${scriptInfo.ext}`,
      knownPaths: process.platform === 'win32' ? [] : [...baseNpxPaths, ...nvmNpxPaths] // Only use paths on Unix
    },
    'uvx': {
      scriptName: `run-uvx${scriptInfo.prefix}${scriptInfo.ext}`,
      knownPaths: process.platform === 'win32' ? [] : [
        '/opt/homebrew/bin/uvx',
        '/usr/local/bin/uvx',
        '/usr/bin/uvx',
        `${homeDir}/.local/bin/uvx`
      ].filter(p => !!homeDir || !p.includes(homeDir))
    },
    'docker': { scriptName: `run-docker${scriptInfo.prefix}${scriptInfo.ext}` },
    'node': { scriptName: `run-node${scriptInfo.prefix}${scriptInfo.ext}` },
    'deno': {
      scriptName: `run-deno${scriptInfo.prefix}${scriptInfo.ext}`,
      knownPaths: process.platform === 'win32' ? [] : [
        `${homeDir}/.deno/bin/deno`,
        '/opt/homebrew/bin/deno',
        '/usr/local/bin/deno'
      ].filter(p => !!homeDir || !p.includes(homeDir))
    }
    // Add other commands as needed
  };

  // 1. Check if the command has special handling defined
  if (specialCommands[command]) {
    const config = specialCommands[command];
    const scriptPath = path.join(scriptBasePath, config.scriptName);

    // 1a. Prioritize using the custom script if it exists
    if (checkPathExists(scriptPath)) {
      console.log(`Using custom script for ${command}: ${scriptPath}`);
      return scriptPath;
    }

    // 1b. If script doesn't exist, check known common paths (if defined)
    if (config.knownPaths) {
      for (const knownPath of config.knownPaths) {
         // Expand ~ if present (already done via homeDir)
         const expandedPath = knownPath;
        if (checkPathExists(expandedPath)) {
          console.log(`Found ${command} at known path: ${expandedPath}`);
          return expandedPath;
        }
      }
    }
  }

  // 2. If no special handling resolved it, try using 'which'
  const whichPath = findCommandUsingWhich(command);
  if (whichPath) {
    // Logging is handled within findCommandUsingWhich
    return whichPath;
  }

  // 3. Final fallback: If 'which' fails, return the original command name.
  console.log(`Could not resolve path for '${command}' via script, known paths, or 'which'. Assuming it's in PATH.`);
  return command;
}

function initializeCommandResolver(app) {
    appInstance = app;
    isAppPackaged = app.isPackaged;
    console.log('CommandResolver Initialized. App packaged:', isAppPackaged);
    // Pre-calculate script base path maybe?
    // getScriptsBasePath();
}

module.exports = {
    initializeCommandResolver,
    resolveCommandPath,
    // Expose others if needed directly, but resolveCommandPath is the main interface
    // getScriptsBasePath,
    // checkPathExists,
    // findCommandUsingWhich
}; 