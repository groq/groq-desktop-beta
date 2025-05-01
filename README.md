# Groq Desktop

[![Latest macOS Build](https://img.shields.io/github/v/release/groq/groq-desktop-beta?include_prereleases&label=latest%20macOS%20.dmg%20build)](https://github.com/groq/groq-desktop-beta/releases/latest)

> **Note**: After installing on macOS, you may need to run this command to open the app:
> ```sh
> xattr -c /Applications/Groq\ Desktop.app
> ```

Groq Desktop features MCP server support for all function calling capable models hosted on Groq.

<img width="450" alt="Screenshot 2025-04-14 at 11 53 18 PM" src="https://github.com/user-attachments/assets/300abf8c-8b7f-4ef8-a5f9-174f93e39506" /><img width="450" alt="Screenshot 2025-04-14 at 11 53 35 PM" src="https://github.com/user-attachments/assets/61641680-5b3d-4ca9-8da4-8e84779f97bb" />

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

## Local development Setup

1. Clone this repository
2. Install dependencies:
   ```
   pnpm install
   ```
3. Start the development server:
   ```
   export GROQ_API_KEY=REPLACE-ME # create one at https://console.groq.com/keys
   pnpm dev
   ```

## Building for Production

To build the application for production:

```
pnpm dist
```

This will create installable packages in the `release` directory.

## Configuration

In the settings page, add your Groq API key:

```json
{
  "GROQ_API_KEY": "your-api-key-here"
}
```

You can obtain a Groq API key by signing up at [https://console.groq.com](https://console.groq.com). 
