FROM node:20-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package.json first (for better caching)
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install

# Copy the rest of the files
COPY . .

# Test script resolution on Linux
CMD ["node", "-e", "const resolver = require('./electron/commandResolver.js'); \
    resolver.initializeCommandResolver({isPackaged: false, getAppPath: () => '/app'}); \
    console.log('Testing Linux script resolution...'); \
    console.log('Node script path:', resolver.resolveCommandPath('node')); \
    console.log('Deno script path:', resolver.resolveCommandPath('deno')); \
    console.log('NPX script path:', resolver.resolveCommandPath('npx')); \
    console.log('Docker script path:', resolver.resolveCommandPath('docker')); \
    console.log('UVX script path:', resolver.resolveCommandPath('uvx'));"]