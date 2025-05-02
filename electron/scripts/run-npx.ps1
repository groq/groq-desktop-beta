# PowerShell script for running NPX

# Add common Node.js paths to PATH
$env:PATH = "$env:USERPROFILE\.nvm\v23.8.0\bin;$env:USERPROFILE\.nvm\v20\bin;$env:USERPROFILE\.nvm\v18\bin;$env:USERPROFILE\.nvm\v16\bin;$env:USERPROFILE\.nvm\current\bin;$env:PATH"

# Print debugging information
Write-Host "Running npx with PATH: $env:PATH"

# Check Node.js and NPX availability
$NODE_PATH = Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $NODE_PATH) {
    Write-Error "Error: Node.js executable not found in PATH"
    exit 1
}

$NPX_PATH = Get-Command npx -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $NPX_PATH) {
    Write-Error "Error: NPX executable not found in PATH"
    exit 1
}

Write-Host "Node location: $NODE_PATH"
Write-Host "NPX location: $NPX_PATH"

# Run npx with the arguments passed to this script
& $NPX_PATH $args