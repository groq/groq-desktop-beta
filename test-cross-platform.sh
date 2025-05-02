#!/bin/bash

# Cross-platform testing script

echo "=== Groq Desktop Cross-Platform Testing ==="
echo

echo "🔍 Testing platform detection..."
node test-paths.js

echo
echo "🐧 Testing Linux support with Docker..."
echo "Building Docker test container..."
docker build -f test-linux.Dockerfile -t groq-desktop-linux-test . && \
echo "Running Linux tests..." && \
docker run --rm groq-desktop-linux-test

echo
echo "📋 Script file check:"
echo "Windows scripts (.cmd):"
ls -la electron/scripts/*.cmd

echo
echo "Windows scripts (.ps1):"
ls -la electron/scripts/*.ps1

echo
echo "macOS/Linux scripts (.sh):"
ls -la electron/scripts/*.sh

echo
echo "✅ Testing complete!"
echo 
echo "To test on Windows, run test-windows.ps1 in PowerShell on a Windows machine."
echo "To build for all platforms, run: pnpm dist"