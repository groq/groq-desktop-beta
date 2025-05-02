// Platform detection test

const path = require('path');
const fs = require('fs');

console.log('=== Platform Detection and Script Testing ===');

// Test macOS script detection
console.log('\n--- Testing macOS scripts ---');
testPlatform('darwin');

// Test Linux script detection
console.log('\n--- Testing Linux scripts ---');
testPlatform('linux');

// Test Windows script detection
console.log('\n--- Testing Windows scripts ---');
testPlatform('win32');

function testPlatform(platform) {
  console.log(`Platform: ${platform}`);
  const pathSeparator = platform === 'win32' ? ';' : ':';
  console.log(`PATH separator: ${pathSeparator}`);
  
  // Get script info
  let scriptInfo;
  if (platform === 'win32') {
    scriptInfo = {
      ext: '.cmd', // Using .cmd as default, could be .ps1
      prefix: ''
    };
  } else if (platform === 'linux') {
    scriptInfo = {
      ext: '.sh',
      prefix: '-linux'
    };
  } else {
    scriptInfo = {
      ext: '.sh',
      prefix: ''
    };
  }
  
  console.log(`Script extension: ${scriptInfo.ext}`);
  console.log(`Script prefix: ${scriptInfo.prefix}`);
  
  // Test command resolution paths
  const commandsToTest = ['node', 'deno', 'npx', 'docker', 'uvx'];
  console.log('\nCommand resolution for this platform:');
  let foundScripts = 0;
  let missingScripts = 0;
  
  commandsToTest.forEach(cmd => {
    const scriptName = `run-${cmd}${scriptInfo.prefix}${scriptInfo.ext}`;
    console.log(`${cmd} -> ${scriptName}`);
    
    // Check if the script exists
    const scriptPath = path.join(__dirname, 'electron', 'scripts', scriptName);
    const exists = fs.existsSync(scriptPath);
    
    if (exists) {
      foundScripts++;
      console.log(`  - Script exists: ✅`);
    } else {
      missingScripts++;
      console.log(`  - Script exists: ❌`);
    }
  });
  
  console.log(`\nSummary: Found ${foundScripts}/${commandsToTest.length} scripts for ${platform}`);
  
  if (missingScripts > 0) {
    console.log('❗ Some scripts are missing for this platform.');
  } else {
    console.log('✅ All expected scripts exist for this platform.');
  }
}

console.log('\n=== Overall Script Inventory ===');
const scriptsDir = path.join(__dirname, 'electron', 'scripts');
const allScripts = fs.readdirSync(scriptsDir);

console.log(`\nTotal script files: ${allScripts.length}`);
console.log('Breakdown by type:');
console.log(`- macOS (.sh files without -linux): ${allScripts.filter(f => f.endsWith('.sh') && !f.includes('-linux')).length}`);
console.log(`- Linux (.sh files with -linux): ${allScripts.filter(f => f.endsWith('.sh') && f.includes('-linux')).length}`);
console.log(`- Windows (.cmd files): ${allScripts.filter(f => f.endsWith('.cmd')).length}`);
console.log(`- Windows PowerShell (.ps1 files): ${allScripts.filter(f => f.endsWith('.ps1')).length}`);

console.log('\nTest complete!')