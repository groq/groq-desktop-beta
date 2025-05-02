# PowerShell script for running Deno

# Print debugging information
Write-Host "Running deno with PATH: $env:PATH"

# Get the deno path
$DENO_PATH = Get-Command deno -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $DENO_PATH) {
    Write-Error "Error: Deno executable not found in PATH: $env:PATH"
    exit 1
}

Write-Host "Deno location: $DENO_PATH"

# Execute deno with the arguments passed to this script
& $DENO_PATH $args