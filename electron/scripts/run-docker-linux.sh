#!/bin/bash

# Linux-specific script for running Docker

# Preserve existing PATH and add common Linux paths
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin:$PATH"

# Get the docker path
DOCKER_PATH="/usr/bin/docker" # Common Linux install path
if [ ! -f "$DOCKER_PATH" ]; then
  DOCKER_PATH=$(which docker 2>/dev/null)
  if [ -z "$DOCKER_PATH" ]; then
    echo "Error: docker executable not found in PATH"
    exit 1
  fi
fi

# Log environment for debugging
echo "Running docker with PATH: $PATH"
echo "Docker path: $DOCKER_PATH"

# Execute docker directly with all arguments
exec "$DOCKER_PATH" "$@"