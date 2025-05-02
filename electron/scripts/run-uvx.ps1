# PowerShell script for running UVX

# Ensure Python environment is properly set
$env:PYTHONUNBUFFERED = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:UV_NATIVE_TLS = "1"

# Print debugging information
Write-Host "Running uvx with PATH: $env:PATH"

# Get the uvx path
$UVX_PATH = Get-Command uvx -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $UVX_PATH) {
    Write-Error "Error: uvx executable not found in PATH"
    exit 1
}

Write-Host "UVX location: $UVX_PATH"

# Execute uvx with the arguments passed to this script
& $UVX_PATH $args