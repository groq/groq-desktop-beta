// Test cross-platform command resolution without modifying process.platform
// (since that doesn't actually work at runtime)

const path = require('path');
const fs = require('fs');

console.log('=== Cross-Platform Command Resolution Simulation ===');

// Commands to test
const commands = ['node', 'deno', 'npx', 'docker', 'uvx'];

// Test for all platforms
const platforms = ['darwin', 'linux', 'win32'];
platforms.forEach(platform => {
  console.log(`\n--- Simulating ${platform} ---`);
  simulatePlatform(platform);
});

function simulatePlatform(platform) {
  // Get script info based on platform
  let scriptInfo;
  if (platform === 'win32') {
    scriptInfo = {
      ext: '.cmd', // We'll use .cmd as default Windows script
      prefix: '',
      separator: ';'
    };
  } else if (platform === 'linux') {
    scriptInfo = {
      ext: '.sh',
      prefix: '-linux',
      separator: ':'
    };
  } else {
    scriptInfo = {
      ext: '.sh',
      prefix: '',
      separator: ':'
    };
  }
  
  console.log(`Platform separator: ${scriptInfo.separator}`);
  
  // Build expected script paths
  const scriptsBaseDir = path.join(__dirname, 'electron', 'scripts');
  
  // Check each command
  commands.forEach(cmd => {
    const expectedScriptName = `run-${cmd}${scriptInfo.prefix}${scriptInfo.ext}`;
    const expectedScriptPath = path.join(scriptsBaseDir, expectedScriptName);
    const scriptExists = fs.existsSync(expectedScriptPath);
    
    console.log(`${cmd} -> ${expectedScriptName}`);
    console.log(`  - Script exists: ${scriptExists ? '✅' : '❌'}`);
    
    if (scriptExists) {
      // For Windows, also check the PowerShell version
      if (platform === 'win32') {
        const psScriptName = `run-${cmd}.ps1`;
        const psScriptPath = path.join(scriptsBaseDir, psScriptName);
        const psScriptExists = fs.existsSync(psScriptPath);
        console.log(`  - PowerShell script exists: ${psScriptExists ? '✅' : '❌'}`);
      }
    }
  });
  
  // Count total scripts for this platform
  const expectedExt = scriptInfo.ext;
  const expectedPrefix = scriptInfo.prefix;
  let scriptCount = 0;
  
  fs.readdirSync(scriptsBaseDir).forEach(file => {
    if (file.endsWith(expectedExt) && 
        (expectedPrefix === '' ? !file.includes('-linux') : file.includes(expectedPrefix))) {
      scriptCount++;
    }
  });
  
  const totalCommands = platform === 'win32' ? commands.length * 2 : commands.length;
  console.log(`\nTotal scripts for ${platform}: ${scriptCount}/${totalCommands === 10 ? 5 : totalCommands}`);
  
  if (platform === 'win32') {
    // Additional check for PowerShell scripts
    const psScriptCount = fs.readdirSync(scriptsBaseDir).filter(file => file.endsWith('.ps1')).length;
    console.log(`PowerShell scripts: ${psScriptCount}/5`);
  }
}

console.log('\nTest complete!');