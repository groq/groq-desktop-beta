#!/bin/bash

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Preserve existing PATH and add common Node.js paths for Linux
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/v23.8.0/bin:$HOME/.nvm/versions/node/v20/bin:$HOME/.nvm/versions/node/v18/bin:$HOME/.nvm/versions/node/v16/bin:$HOME/.nvm/current/bin:$HOME/.local/bin:$PATH"

# Print debugging information
echo "Running npx with PATH: $PATH"
echo "Node location: $(which node 2>/dev/null || echo 'Node not found')"
echo "NPX location: $(which npx 2>/dev/null || echo 'NPX not found')"

# Get the node path
NODE_PATH=$(which node)

if [ -z "$NODE_PATH" ]; then
  echo "Error: Node.js executable not found in PATH"
  exit 1
fi

# Run npx with the arguments passed to this script
$NODE_PATH $(which npx) "$@"