# PowerShell script for running Node.js

# Add common Node.js paths to PATH
$env:PATH = "$env:USERPROFILE\.nvm\v23.8.0\bin;$env:USERPROFILE\.nvm\v20\bin;$env:USERPROFILE\.nvm\v18\bin;$env:USERPROFILE\.nvm\v16\bin;$env:USERPROFILE\.nvm\current\bin;$env:PATH"

# Print debugging information
Write-Host "Running node with PATH: $env:PATH"

# Get the node path
$NODE_PATH = Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $NODE_PATH) {
    Write-Error "Error: Node.js executable not found in PATH"
    exit 1
}

Write-Host "Node location: $NODE_PATH"

# Run node with the arguments passed to this script
& $NODE_PATH $args