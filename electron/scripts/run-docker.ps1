# PowerShell script for running Docker

# Print debugging information
Write-Host "Running docker with PATH: $env:PATH"

# Get the docker path
$DOCKER_PATH = Get-Command docker -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $DOCKER_PATH) {
    Write-Error "Error: Docker executable not found in PATH"
    exit 1
}

Write-Host "Docker location: $DOCKER_PATH"

# Execute docker with the arguments passed to this script
& $DOCKER_PATH $args