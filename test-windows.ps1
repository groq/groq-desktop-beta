# PowerShell script to test Windows functionality

# Function to test script existence
function Test-ScriptExistence {
    param (
        [string]$ScriptName
    )
    $scriptPath = Join-Path -Path "./electron/scripts" -ChildPath $ScriptName
    if (Test-Path $scriptPath) {
        Write-Host "✅ Found script: $ScriptName" -ForegroundColor Green
    } else {
        Write-Host "❌ Missing script: $ScriptName" -ForegroundColor Red
    }
}

Write-Host "Testing Windows script files existence..." -ForegroundColor Cyan

# Check for Windows script files
Test-ScriptExistence -ScriptName "run-deno.cmd"
Test-ScriptExistence -ScriptName "run-deno.ps1"
Test-ScriptExistence -ScriptName "run-node.cmd"
Test-ScriptExistence -ScriptName "run-node.ps1"
Test-ScriptExistence -ScriptName "run-npx.cmd"
Test-ScriptExistence -ScriptName "run-npx.ps1"
Test-ScriptExistence -ScriptName "run-docker.cmd"
Test-ScriptExistence -ScriptName "run-docker.ps1"
Test-ScriptExistence -ScriptName "run-uvx.cmd"
Test-ScriptExistence -ScriptName "run-uvx.ps1"

Write-Host "Testing platform detection..." -ForegroundColor Cyan
Write-Host "Platform: $env:OS"
Write-Host "PATH separator: $(if ($env:OS -like "*Windows*") { ";" } else { ":" })"

Write-Host "Done testing Windows script setup" -ForegroundColor Cyan