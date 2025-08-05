# Groq Desktop

[![Latest macOS Build](https://img.shields.io/github/v/release/groq/groq-desktop-beta?include_prereleases&label=latest%20macOS%20.dmg%20build)](https://github.com/groq/groq-desktop-beta/releases/latest)

Groq Desktop features MCP server support for all function calling capable models hosted on Groq. Now available for Windows, macOS, and Linux!

> **Note for macOS Users**: After installing on macOS, you may need to run this command to open the app:
> ```sh
> xattr -c /Applications/Groq\ Desktop.app
> ```
<img width="450" alt="Screenshot 2025-08-05 at 11 32 04 AM" src="https://github.com/user-attachments/assets/d4fd9224-8186-4117-bdeb-b477f8a42d49" />
<br>
<br>
<img width="450" alt="Screenshot 2025-08-05 at 11 28 49 AM" src="https://github.com/user-attachments/assets/ced9c517-74f0-46b0-8e91-40ebc88adc3a" />


## Unofficial Homebrew Installation (macOS)

You can install the latest release using [Homebrew](https://brew.sh/) via an unofficial tap:

```sh
brew tap ricklamers/groq-desktop-unofficial
brew install --cask groq-desktop
# Allow the app to run
xattr -c /Applications/Groq\ Desktop.app
```

## Features

- Chat interface with image support
- Local MCP servers

## Prerequisites

- Node.js (v18+)
- pnpm package manager

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Start the development server:
   ```
   pnpm dev
   ```

## Troubleshooting

### Electron Installation Issues

If you encounter an error like "Electron failed to install correctly" when running `pnpm dev`, this is likely because pnpm blocked the build scripts for security reasons. To fix this:

1. Remove the corrupted installation:
   ```bash
   rm -rf node_modules
   ```

2. Reinstall dependencies:
   ```bash
   pnpm install
   ```

3. Approve the build scripts when prompted (or run manually):
   ```bash
   pnpm approve-builds
   ```
   Select `electron` and `esbuild` when prompted to allow their post-install scripts to run.

4. Try running the dev server again:
   ```bash
   pnpm dev
   ```

## Building for Production

To build the application for production:

```
pnpm dist
```

This will create installable packages in the `release` directory for your current platform.

### Building for Specific Platforms

```bash
# Build for all supported platforms
pnpm dist

# Build for macOS only
pnpm dist:mac

# Build for Windows only
pnpm dist:win

# Build for Linux only
pnpm dist:linux
```

### Testing Cross-Platform Support

This app now supports Windows, macOS, and Linux. Here's how to test cross-platform functionality:

#### Running Cross-Platform Tests

We've added several test scripts to verify platform support:

```bash
# Run all platform tests (including Docker test for Linux)
pnpm test:platforms

# Run basic path handling test only
pnpm test:paths

# If on Windows, run the PowerShell test script
.\test-windows.ps1
```

The testing scripts will check:
- Platform detection
- Script file resolution
- Environment variable handling
- Path separators
- Command resolution

## Configuration

In the settings page, add your Groq API key:

```json
{
  "GROQ_API_KEY": "your-api-key"
}
```

You can obtain a Groq API key by signing up at [https://console.groq.com](https://console.groq.com). 
