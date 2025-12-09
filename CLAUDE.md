# CLAUDE.md - AI Assistant Guide for Groq Desktop

This document provides comprehensive guidance for AI assistants working on the Groq Desktop codebase. Last updated: 2025-12-09

## Project Overview

**Groq Desktop** is an Electron-based desktop application that provides a chat interface for Groq's LLM API with advanced features including:
- Multi-platform support (Windows, macOS, Linux)
- MCP (Model Context Protocol) server integration for function calling
- Two API modes: Standard Chat Completions and Responses API (Beta/Agentic)
- Google OAuth integration for Google Connectors (Gmail, Calendar, Drive)
- Vision support for image-capable models (e.g., llama-4)
- Built-in tools for gpt-oss models (Code Interpreter, Browser Search)
- Persistent chat history with auto-generated titles
- Real-time streaming responses with reasoning display
- Tool approval system with configurable permissions

## Tech Stack

### Core Technologies
- **Electron 37.0.0** - Desktop application framework
- **React 19.0.1** - UI library
- **Vite 6.2.6** - Build tool and dev server
- **Tailwind CSS 3.3.3** - Styling framework
- **pnpm 10.9.0** - Package manager

### Key Dependencies
- **groq-sdk 0.16.0** - Groq API client
- **@modelcontextprotocol/sdk 1.7.0** - MCP server support
- **react-router-dom 7.3.0** - Routing
- **react-markdown 10.1.0** - Markdown rendering
- **electron-json-storage 4.6.0** - Persistent storage
- **zod 3.24.2** - Schema validation

### UI Components
- **@radix-ui** - Accessible component primitives (Select, Slot)
- **lucide-react** - Icon library
- **class-variance-authority** - Component variant management
- **next-themes** - Theme management

## Architecture

### Process Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Electron App                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────────────┐         ┌─────────────────────┐   │
│  │   Main Process     │ ◄─IPC──►│ Renderer Process    │   │
│  │   (Node.js)        │         │ (Chromium + React)  │   │
│  │                    │         │                     │   │
│  │ - electron/main.js │         │ - src/renderer/     │   │
│  │ - MCP Manager      │         │ - React Components  │   │
│  │ - Chat Handler     │         │ - ChatContext       │   │
│  │ - Tool Execution   │         │ - UI State          │   │
│  │ - OAuth Flows      │         │                     │   │
│  │ - File System      │         │                     │   │
│  └────────┬───────────┘         └─────────────────────┘   │
│           │                                                │
│           │ Bridge: electron/preload.js                    │
│           │ (contextBridge.exposeInMainWorld)              │
│           │                                                │
└───────────┼────────────────────────────────────────────────┘
            │
            ▼
    ┌───────────────────┐
    │   External APIs   │
    │                   │
    │ - Groq API        │
    │ - MCP Servers     │
    │ - Google OAuth    │
    └───────────────────┘
```

### Directory Structure

```
groq-desktop-beta/
├── electron/                    # Main Process (Node.js)
│   ├── main.js                 # App entry, window management, IPC setup
│   ├── preload.js              # Context bridge (security boundary)
│   ├── chatHandler.js          # Groq API communication (both modes)
│   ├── mcpManager.js           # MCP server lifecycle management
│   ├── toolHandler.js          # Tool execution via MCP clients
│   ├── authManager.js          # MCP OAuth 2.0 flows
│   ├── googleOAuthManager.js   # Google OAuth refresh tokens
│   ├── chatHistoryManager.js   # Chat persistence to disk
│   ├── settingsManager.js      # Settings persistence
│   ├── commandResolver.js      # Platform-aware command resolution
│   ├── contextCapture.js       # Global hotkey for context capture
│   ├── messageUtils.js         # Message pruning/cleaning
│   ├── popupWindow.js          # Popup window management
│   ├── windowManager.js        # Window creation utilities
│   ├── utils.js                # Shared utilities
│   └── scripts/                # Platform-specific runners
│       ├── run-node.{sh,cmd,ps1}
│       ├── run-npx.{sh,cmd,ps1}
│       ├── run-uvx.{sh,cmd,ps1}
│       └── run-deno.{sh,cmd,ps1}
│
├── src/renderer/               # Renderer Process (React)
│   ├── main.jsx               # React entry point
│   ├── App.jsx                # Main app component (chat orchestration)
│   ├── index.css              # Global styles, CSS variables
│   │
│   ├── context/
│   │   └── ChatContext.jsx    # Chat state management (messages, history)
│   │
│   ├── pages/
│   │   ├── Settings.jsx       # Settings UI (API keys, MCP, OAuth)
│   │   └── PopupPage.jsx      # Context capture popup
│   │
│   ├── components/
│   │   ├── ChatInput.jsx      # Message input with image support
│   │   ├── MessageList.jsx    # Conversation display
│   │   ├── Message.jsx        # Individual message rendering
│   │   ├── ToolCall.jsx       # Tool call visualization
│   │   ├── ToolsPanel.jsx     # MCP server/tool management
│   │   ├── ChatHistorySidebar.jsx  # Chat history navigation
│   │   ├── ToolApprovalModal.jsx   # Tool permission requests
│   │   ├── LogViewerModal.jsx      # API request log viewer
│   │   ├── MarkdownRenderer.jsx    # Markdown with syntax highlighting
│   │   └── ui/                # Reusable UI components (shadcn-style)
│   │       ├── button.jsx
│   │       ├── input.jsx
│   │       ├── select.jsx
│   │       ├── card.jsx
│   │       ├── badge.jsx
│   │       ├── Switch.jsx
│   │       ├── SearchableSelect.jsx
│   │       └── text-shimmer.jsx
│   │
│   └── lib/
│       └── utils.js           # UI utilities (cn, clsx+twMerge)
│
├── shared/                     # Shared between processes
│   └── models.js              # Model configurations and API fetching
│
├── public/                     # Static assets
│   ├── icon.png               # App icon
│   └── ...
│
├── dist/                       # Vite build output (gitignored)
├── release/                    # Electron build output (gitignored)
│
├── package.json               # Dependencies and scripts
├── vite.config.cjs            # Vite configuration
├── electron-builder.yml       # Electron Builder settings
├── tailwind.config.cjs        # Tailwind CSS configuration
├── postcss.config.cjs         # PostCSS configuration
├── eslint.config.js           # ESLint configuration (Flat config)
└── pnpm-workspace.yaml        # pnpm workspace configuration
```

## Key Subsystems

### 1. IPC Communication Pattern

**All communication between renderer and main process goes through the preload bridge:**

```javascript
// electron/preload.js - Define API surface
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Example: Send message and get response
  sendMessage: (message) => ipcRenderer.invoke('send-message', message),

  // Example: Start streaming
  startChatStream: (messages, model) => {
    const eventId = Date.now();
    return {
      onContent: (callback) => ipcRenderer.on(`chat-content-${eventId}`, callback),
      onComplete: (callback) => ipcRenderer.on(`chat-complete-${eventId}`, callback),
      cleanup: () => {
        ipcRenderer.removeAllListeners(`chat-content-${eventId}`);
        ipcRenderer.removeAllListeners(`chat-complete-${eventId}`);
      }
    };
  }
});

// electron/main.js - Handle requests
ipcMain.handle('send-message', async (event, message) => {
  const result = await processMessage(message);
  return result;
});

// src/renderer/App.jsx - Use in React
const handleSend = async (message) => {
  const result = await window.electron.sendMessage(message);
  // Handle result
};
```

**Critical Rule:** Never use `require()` or Node.js APIs directly in renderer code. Always go through `window.electron.*` APIs.

### 2. Chat Handler (Two API Modes)

Located in `electron/chatHandler.js`, this is the core of the application's AI interaction.

#### Standard Chat Completions API

```javascript
// Used for: Normal chat, local MCP tools, basic streaming
const stream = await groq.chat.completions.create({
  messages: conversationHistory,
  model: selectedModel,
  tools: mcpTools,  // Local tools only
  stream: true,
  temperature: 0.7
});

for await (const chunk of stream) {
  // Handle content, tool_calls, reasoning
}
```

#### Responses API (Beta/Agentic Mode)

```javascript
// Used for: Remote MCP servers, Google Connectors, advanced agentic workflows
const response = await fetch(`${baseUrl}/openai/v1/chat/responses`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: selectedModel,
    messages: conversationHistory,
    tools: allTools,  // Local + remote tools
    mcp_servers: remoteMcpServers,  // SSE/HTTP MCP servers
    google_connectors: googleConnectorConfigs,
    stream: true
  })
});

// Parse Server-Sent Events
const reader = response.body;
// Handle: content, reasoning, tool_calls, pre_calculated_tool_responses, mcp_approval_request
```

**Key Differences:**
- Standard API: Client-side tool execution only
- Responses API: Server-side tool execution for remote MCPs, approval workflow
- Responses API supports `pre_calculated_tool_responses` (server already executed tool)
- Responses API supports `mcp_approval_request`/`mcp_approval_response` flow

### 3. MCP Server Management

Located in `electron/mcpManager.js`

#### Transport Types Supported

1. **STDIO** - Local processes
```json
{
  "type": "stdio",
  "command": "node",
  "args": ["server.js"],
  "env": { "API_KEY": "..." }
}
```

2. **SSE** - Server-Sent Events (remote)
```json
{
  "type": "sse",
  "url": "https://example.com/mcp",
  "headers": { "Authorization": "Bearer token" }
}
```

3. **StreamableHTTP** - HTTP streaming (remote)
```json
{
  "type": "streamableHttp",
  "url": "https://example.com/mcp",
  "headers": { "X-API-Key": "..." }
}
```

#### Connection Lifecycle

```javascript
// 1. Initialize on app startup
await mcpManager.initialize();

// 2. Auto-connect all servers (1 second delay)
setTimeout(() => mcpManager.autoConnectServers(), 1000);

// 3. Health checks every 60 seconds
setInterval(() => {
  for (const serverId of connectedServers) {
    const isHealthy = await client.listTools();
    if (!isHealthy) disconnectServer(serverId);
  }
}, 60000);

// 4. Tool discovery
const tools = await client.listTools();
discoveredTools.push(...tools.map(t => ({ ...t, serverId })));

// 5. Notify renderer
mainWindow.webContents.send('mcp-status-changed', { serverId, status: 'connected' });
```

#### Command Resolution

Platform-aware command resolution in `electron/commandResolver.js`:

```javascript
// Resolves: npx, uvx, docker, node, deno, python, custom commands
// Platform detection: win32, darwin, linux
// Script selection: .sh (Mac/Linux), .cmd (Windows), .ps1 (PowerShell)
// Special case: .sh vs -linux.sh for better compatibility

const resolvedCommand = await resolveCommand('npx', args, env);
// Returns: { command: '/path/to/run-npx.sh', args: [...] }
```

### 4. Tool Execution Flow

```
User Message
    ↓
Model Response (with tool_calls)
    ↓
Check Approval Status (localStorage)
    ↓
    ├─ Auto-approved → Execute
    └─ Not approved → Show ToolApprovalModal
            ↓
        User Decision
            ↓
            ├─ Approve Once → Execute
            ├─ Approve Always → Save to localStorage → Execute
            └─ Deny → Add error message
                ↓
        Execute Tool (toolHandler.js)
            ↓
        Find MCP Client by serverId
            ↓
        client.callTool({ name, arguments })
            ↓
        Limit Output Length (20,000 chars)
            ↓
        Add Tool Response to Messages
            ↓
        Continue Conversation (send back to model)
```

**Tool Approval Modes:**
- `prompt` - Ask for each tool (default)
- `always` - Per-tool auto-approval (stored: `tool_approval_${toolName}`)
- `yolo` - All tools auto-approved (stored: `tool_approval_yolo_mode`)

**Remote Tools (Responses API):**
- Server executes tools, returns `pre_calculated_tool_responses`
- Approval via `mcp_approval_request` items (server asks client)
- Client sends `mcp_approval_response` to continue

### 5. Authentication Systems

#### Google OAuth (googleOAuthManager.js)

```javascript
// Stores: refresh_token, client_id, client_secret
// Auto-refresh: 5 minutes before expiry
// Usage: Google Connectors in Responses API

const tokenInfo = await getTokenStatus();
// { hasAuth: true, expiresAt: '2025-12-10T10:30:00Z', isValid: true }

// Refresh flow
const newTokens = await refreshAccessToken();
// { access_token, expires_in, refresh_token }
```

#### MCP OAuth (authManager.js)

```javascript
// OAuth 2.0 Authorization Code Flow with PKCE
// Dynamic client registration
// Local callback server (port 10000+)

const result = await handleOAuthFlow(serverUrl, serverId);
// 1. Start local server
// 2. Discover OAuth metadata (/.well-known/oauth-authorization-server)
// 3. Register client (if needed) with redirect_uri
// 4. Open browser for authorization
// 5. Capture callback, exchange code for tokens
// 6. Store tokens, retry MCP connection
// 7. Cleanup server
```

#### API Key Authentication

```javascript
// Stored in: userData/settings.json
// Key: GROQ_API_KEY
// Loaded on startup, used in all API requests

const settings = await settingsManager.getSettings();
const apiKey = settings.GROQ_API_KEY || process.env.GROQ_API_KEY;
```

### 6. Chat History Management

Located in `electron/chatHistoryManager.js`

```javascript
// Storage: userData/chat-history/{chatId}.json

// Structure
{
  id: "uuid-v4",
  title: "Generated by llama-3.1-8b-instant",
  createdAt: "2025-12-09T12:00:00Z",
  updatedAt: "2025-12-09T12:05:00Z",
  model: "llama-3.3-70b-versatile",
  useResponsesApi: false,
  messages: [
    { role: "user", content: "..." },
    { role: "assistant", content: "...", tool_calls: [...] },
    { role: "tool", tool_call_id: "...", content: "..." }
  ]
}

// Auto-save on every message update
// Title generation: After first user message
// Message cleaning: Removes transient properties (isStreaming, liveReasoning)
```

### 7. State Management Pattern

#### ChatContext (Global State)

```jsx
// src/renderer/context/ChatContext.jsx
const ChatContext = createContext();

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatList, setChatList] = useState([]);

  // Auto-save wrapper
  const setMessagesWithSave = useCallback((newMessages) => {
    setMessages(newMessages);
    if (currentChatIdRef.current) {
      window.electron.updateChatMessages(currentChatIdRef.current, newMessages);
      // Update local chat list timestamp (avoid reload)
      setChatList(prev => prev.map(chat =>
        chat.id === currentChatIdRef.current
          ? { ...chat, updatedAt: new Date().toISOString() }
          : chat
      ));
    }
  }, []);

  return (
    <ChatContext.Provider value={{ messages, setMessagesWithSave, ... }}>
      {children}
    </ChatContext.Provider>
  );
}
```

#### Local Component State (App.jsx)

```jsx
// Model selection, streaming state, UI state
const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
const [isLoading, setIsLoading] = useState(false);
const [mcpTools, setMcpTools] = useState([]);
const [showToolApproval, setShowToolApproval] = useState(false);
const [currentToolCall, setCurrentToolCall] = useState(null);
```

### 8. Model Configuration

Located in `shared/models.js`

```javascript
// Dynamic model fetching from Groq API
const models = await getModelsFromAPIWithCache(apiKey);

// 5-minute cache
// Filters: Excludes whisper, guard models; includes only active chat models
// Heuristics:
//   - 'gpt-oss' in name → builtin_tools_supported: true
//   - 'llama-4' in name → vision_supported: true
// Custom models: Merged from settings.customModels

// Structure
{
  "llama-3.3-70b-versatile": {
    context: 32768,
    vision_supported: false,
    builtin_tools_supported: false
  },
  "llama-4-scout-beta-preview": {
    context: 8192,
    vision_supported: true,
    builtin_tools_supported: false
  },
  "gpt-oss-llama-3.1-405b": {
    context: 16384,
    vision_supported: false,
    builtin_tools_supported: true  // Code Interpreter, Browser Search
  }
}
```

### 9. Message Pruning Strategy

Located in `electron/messageUtils.js`

```javascript
// Goal: Keep messages under 50% of context window

1. Calculate total tokens (rough estimate: chars * 0.3)
2. If under limit, return messages as-is
3. If over limit:
   a. Keep system message (if present)
   b. Keep last N user/assistant/tool message groups
   c. Keep most recent reasoning/tool_calls
   d. Remove oldest messages first
   e. Never remove in-progress tool_call/tool_response pairs

// Special handling
- Vision messages: Count base64 images as ~800 tokens
- Tool outputs: Limit to 20,000 chars each
- Reasoning: Included in token count
```

### 10. Streaming Architecture

```javascript
// electron/chatHandler.js - Start stream
ipcMain.handle('start-chat-stream', async (event, messages, model, options) => {
  const stream = await createStreamingRequest(messages, model);
  const eventId = `stream-${Date.now()}`;

  for await (const chunk of stream) {
    // Send progressive updates
    if (chunk.choices[0].delta.content) {
      event.sender.send(`chat-content-${eventId}`, {
        content: chunk.choices[0].delta.content
      });
    }

    if (chunk.choices[0].delta.reasoning_content) {
      event.sender.send(`chat-reasoning-${eventId}`, {
        reasoning: chunk.choices[0].delta.reasoning_content
      });
    }

    if (chunk.choices[0].delta.tool_calls) {
      event.sender.send(`chat-tool-calls-${eventId}`, {
        toolCalls: chunk.choices[0].delta.tool_calls
      });
    }
  }

  event.sender.send(`chat-complete-${eventId}`, { finalMessage });
});

// src/renderer/App.jsx - Handle stream
const handler = window.electron.startChatStream(messages, selectedModel);

handler.onContent(({ content }) => {
  // Update live message content
  setMessages(prev => prev.map(msg =>
    msg.id === streamingMessageId
      ? { ...msg, content: msg.content + content }
      : msg
  ));
});

handler.onComplete(({ finalMessage }) => {
  // Replace placeholder with final message
  setMessages(prev => prev.map(msg =>
    msg.id === streamingMessageId ? finalMessage : msg
  ));
  handler.cleanup();
});
```

### 11. Reasoning Display

```javascript
// Two modes of reasoning display:

// 1. Live Reasoning (during streaming)
{
  role: 'assistant',
  content: '...',
  isStreaming: true,
  liveReasoning: 'Current reasoning chunk...',
  reasoning_summary: 'Analyzing data'  // Background summarization
}

// 2. Final Reasoning (after completion)
{
  role: 'assistant',
  content: '...',
  reasoning_content: 'Full reasoning text...'
}

// Background Summarization (chatHandler.js)
// - Every 2 seconds during reasoning
// - Uses llama-3.1-8b-instant
// - Generates 3-5 word summaries
// - Can be disabled: settings.disableThinkingSummaries
```

## Development Workflows

### Setup

```bash
# 1. Install pnpm globally (if not already installed)
npm install -g pnpm@10.9.0

# 2. Clone repository
git clone <repo-url>
cd groq-desktop-beta

# 3. Install dependencies
pnpm install

# 4. (If pnpm blocks scripts) Approve build scripts
pnpm approve-builds
# Select: electron, esbuild

# 5. Start development server
pnpm dev
```

### Development Commands

```bash
# Development
pnpm dev              # Start Vite + Electron (recommended)
pnpm dev:vite         # Vite dev server only (http://localhost:5173)
pnpm dev:electron     # Electron only (requires built files)

# Building
pnpm build            # Build renderer (Vite → dist/)
pnpm build:electron   # Package with Electron Builder

# Distribution (includes build)
pnpm dist             # Build for current platform
pnpm dist:mac         # macOS (.dmg)
pnpm dist:win         # Windows (.exe, portable)
pnpm dist:linux       # Linux (.AppImage, .deb, .rpm)

# Testing
pnpm test:platforms   # Cross-platform tests (includes Docker)
pnpm test:paths       # Path handling test
```

### Hot Reload Behavior

- **Renderer Process:** Full HMR via Vite
  - Changes to `src/renderer/**` → Instant reload
  - No app restart needed

- **Main Process:** Manual restart required
  - Changes to `electron/**` → Must restart `pnpm dev`
  - Or use `nodemon`/`electron-reloader` (not configured by default)

### Adding New IPC Handlers

1. **Define handler in main process** (`electron/main.js` or relevant module):
```javascript
// electron/newFeature.js
async function handleNewFeature(arg) {
  // Implementation
  return result;
}

module.exports = { handleNewFeature };

// electron/main.js
const { handleNewFeature } = require('./newFeature');
ipcMain.handle('new-feature', async (event, arg) => {
  return await handleNewFeature(arg);
});
```

2. **Expose in preload** (`electron/preload.js`):
```javascript
contextBridge.exposeInMainWorld('electron', {
  // ... existing APIs
  newFeature: (arg) => ipcRenderer.invoke('new-feature', arg)
});
```

3. **Use in renderer** (`src/renderer/App.jsx` or component):
```javascript
const handleClick = async () => {
  const result = await window.electron.newFeature(arg);
  console.log(result);
};
```

### Adding New React Components

1. **Create component file** (`src/renderer/components/NewComponent.jsx`):
```jsx
import React from 'react';

export default function NewComponent({ prop1, prop2 }) {
  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
```

2. **Import and use:**
```jsx
import NewComponent from '@/components/NewComponent';

function App() {
  return <NewComponent prop1="value" prop2={42} />;
}
```

**Note:** The `@` alias resolves to `src/renderer/` (configured in `vite.config.cjs`).

### Adding New MCP Server

1. **Open Settings page** in the app
2. **Navigate to MCP Servers section**
3. **Click "Add Server"**
4. **Configure:**
   - **Server ID:** Unique identifier (e.g., `my-server`)
   - **Transport Type:** `stdio`, `sse`, or `streamableHttp`
   - **Command/URL:** Depends on transport type
     - STDIO: `node`, `python`, `docker`, `npx`, `uvx`, `deno`
     - SSE/HTTP: Full URL
   - **Args:** Array of arguments (STDIO only)
   - **Env:** Environment variables (STDIO only)
   - **Headers:** Custom headers (SSE/HTTP only)
   - **Auth:** OAuth configuration (if required)

5. **Save and Connect**

**Storage:** Saved to `userData/settings.json` under `mcpServers` key.

**Programmatic Example:**
```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": {},
      "timeout": 5000,
      "autoConnect": true
    }
  }
}
```

### Debugging

#### Main Process Debugging

```bash
# 1. Add debugger statements or console.log
console.log('Main process:', data);

# 2. Open DevTools for main process
# In electron/main.js, add:
require('electron-debug')({ showDevTools: true });

# Or use Chrome DevTools
electron --inspect=5858 .
# Then open chrome://inspect in Chrome
```

#### Renderer Process Debugging

```bash
# DevTools automatically open in development mode
# Or manually in app: View → Toggle Developer Tools

# React DevTools
# Install extension: https://react.dev/learn/react-developer-tools
```

#### API Request Logging

```javascript
// Enable in Settings
settings.enableApiLogging = true;

// Logs saved to: /tmp/groq-api-request-YYYYMMDD-HHMMSS-ID.json
// Contains: model, messages, tools, response, timestamps
```

#### MCP Connection Issues

```javascript
// Check logs
console.log('MCP Status:', await window.electron.getMCPStatus());

// Force reconnect
await window.electron.reconnectMCPServer(serverId);

// Check health
await window.electron.checkMCPHealth(serverId);
```

## Code Conventions

### File Naming
- **React components:** PascalCase (e.g., `ChatInput.jsx`, `ToolsPanel.jsx`)
- **Utilities/helpers:** camelCase (e.g., `utils.js`, `messageUtils.js`)
- **Managers/handlers:** camelCase (e.g., `mcpManager.js`, `chatHandler.js`)
- **Config files:** kebab-case (e.g., `vite.config.cjs`, `tailwind.config.cjs`)

### Code Style

#### JavaScript/JSX
```javascript
// Use ESLint flat config (eslint.config.js)
// Rules:
// - Unused vars: warn (allow _prefixed)
// - Prop types: off (using TypeScript patterns, not enforced)
// - JSX runtime: automatic (no need to import React)

// Formatting preferences (inferred from codebase)
// - 2-space indentation
// - Single quotes for strings
// - Semicolons required
// - Trailing commas in multiline
```

#### React Patterns
```jsx
// Prefer functional components with hooks
function MyComponent({ prop1, prop2 }) {
  const [state, setState] = useState(initialValue);

  useEffect(() => {
    // Side effects
  }, [dependencies]);

  return <div>{/* JSX */}</div>;
}

// Use context for global state
const { messages, setMessages } = useContext(ChatContext);

// Use refs for values that don't trigger re-renders
const currentChatIdRef = useRef(null);
```

#### Styling
```jsx
// Use Tailwind utility classes
<div className="flex items-center gap-2 p-4 bg-gray-100 rounded-lg">

// Use cn() helper for conditional classes
import { cn } from '@/lib/utils';

<div className={cn(
  'base-classes',
  isActive && 'active-classes',
  variant === 'primary' && 'primary-classes'
)}>
```

#### Error Handling
```javascript
// Main process: Log errors, return error objects
try {
  const result = await riskyOperation();
  return { success: true, data: result };
} catch (error) {
  console.error('Operation failed:', error);
  return { success: false, error: error.message };
}

// Renderer: Show user-friendly errors
try {
  await window.electron.someOperation();
} catch (error) {
  console.error(error);
  alert(`Error: ${error.message}`);
  // Or use toast/notification system
}
```

### Git Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes, commit frequently
git add .
git commit -m "feat: add new feature"

# 3. Push to remote
git push origin feature/my-feature

# 4. Create pull request
# Use GitHub UI or gh CLI

# Commit message format (conventional commits)
# feat: New feature
# fix: Bug fix
# docs: Documentation
# style: Formatting
# refactor: Code restructuring
# test: Tests
# chore: Maintenance
```

## Common Tasks

### Add New Model

```javascript
// Option 1: Let API discovery find it (automatic)
// Models are fetched from Groq API every 5 minutes

// Option 2: Add custom model in Settings UI
// Settings → Models → Add Custom Model
{
  "modelId": "custom-model-name",
  "displayName": "Custom Model",
  "context": 8192,
  "vision_supported": false,
  "builtin_tools_supported": false
}

// Option 3: Programmatically in code
// Edit shared/models.js or settings
```

### Add New UI Component

```bash
# Using shadcn-style pattern

# 1. Create component file
# src/renderer/components/ui/my-component.jsx

import { cn } from '@/lib/utils';

export function MyComponent({ className, ...props }) {
  return (
    <div className={cn('base-styles', className)} {...props}>
      {props.children}
    </div>
  );
}

# 2. Export from index (optional)
# src/renderer/components/ui/index.js
export * from './my-component';
```

### Add New Settings Field

```javascript
// 1. Update Settings.jsx UI
<div>
  <label>New Setting</label>
  <input
    value={settings.newSetting || ''}
    onChange={(e) => handleSettingChange('newSetting', e.target.value)}
  />
</div>

// 2. Default value (optional)
// In electron/settingsManager.js
const DEFAULT_SETTINGS = {
  // ... existing
  newSetting: 'default-value'
};

// 3. Use in code
const settings = await window.electron.getSettings();
console.log(settings.newSetting);
```

### Add New Tool (Built-in)

```javascript
// In electron/chatHandler.js

// 1. Define tool schema
const newTool = {
  type: 'function',
  function: {
    name: 'new_tool',
    description: 'Description of what this tool does',
    parameters: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'Parameter description' }
      },
      required: ['param1']
    }
  }
};

// 2. Add to built-in tools array
const builtInTools = [
  // ... existing tools
  newTool
];

// 3. Handle execution in toolHandler.js
// Or implement custom handler in chatHandler.js
```

### Add Platform-Specific Script

```bash
# 1. Create scripts in electron/scripts/
# run-mycmd.sh (Mac/Linux)
#!/bin/bash
mycmd "$@"

# run-mycmd.cmd (Windows)
@echo off
mycmd %*

# run-mycmd.ps1 (PowerShell)
& mycmd @args

# 2. Make executable
chmod +x electron/scripts/run-mycmd.sh

# 3. Add to electron-builder.yml asarUnpack
asarUnpack:
  - "electron/scripts/*.sh"
  - "electron/scripts/*.cmd"
  - "electron/scripts/*.ps1"

# 4. Use in MCP server config
{
  "type": "stdio",
  "command": "mycmd",  // Will resolve to run-mycmd.{sh,cmd,ps1}
  "args": ["arg1", "arg2"]
}
```

## Performance Considerations

### Message Pruning
- Automatically prunes messages to 50% of context window
- Uses rough estimation: chars * 0.3 = tokens
- Vision images counted as ~800 tokens
- Keeps recent message groups intact

### MCP Health Checks
- Every 60 seconds
- Only calls `listTools()` (lightweight)
- Auto-disconnects unhealthy servers
- Prevents zombie connections

### Streaming Optimizations
- Progressive UI updates (not waiting for full response)
- Auto-scroll only when user at bottom
- Uses `requestAnimationFrame` for smooth scrolling
- Cleanup event listeners on completion

### Token Caching
- Model list cached for 5 minutes
- Reduces API calls
- Stale cache used on fetch failure

### Local Storage
- Chat history stored as individual files (not one large file)
- Metadata-only loading for chat list
- Full messages loaded on-demand
- Settings debounced on save

## Security Considerations

### Context Isolation
- **Enabled** via `contextIsolation: true` in BrowserWindow
- Renderer cannot access Node.js APIs directly
- All communication via `contextBridge` in preload.js

### Node Integration
- **Disabled** via `nodeIntegration: false`
- Prevents arbitrary code execution in renderer

### Remote Content
- Only loads from `localhost:5173` (dev) or `file://` (prod)
- No external URLs loaded in main window

### API Key Storage
- Stored in `userData/settings.json` (OS-protected directory)
- Not exposed to renderer (sent via IPC only)
- Never logged or sent to untrusted endpoints

### OAuth Tokens
- Refresh tokens stored in `electron-json-storage`
- Access tokens refreshed automatically
- State verification in OAuth flows (prevents CSRF)

### Tool Execution
- User approval required (default)
- Per-tool approval persistence (localStorage in renderer)
- Sandboxed MCP servers (separate processes)

## Testing

### Manual Testing

```bash
# Cross-platform tests
pnpm test:platforms    # All platforms (requires Docker for Linux)
pnpm test:paths        # Path handling only

# Windows-specific
.\test-windows.ps1

# Test files:
# - test-platform-detection.js (platform detection)
# - test-resolver.js (command resolution)
# - test-popup-window.js (popup window)
```

### Testing MCP Servers

```bash
# 1. Add test server in Settings
# Example: Memory server
{
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-memory"]
}

# 2. Check connection status in Tools Panel
# Should show "Connected" with green indicator

# 3. Test tool execution
# Send message: "Remember that my favorite color is blue"
# Then: "What's my favorite color?"
# Should use memory tool to recall

# 4. Check logs
# Settings → Enable API Logging
# Check /tmp/groq-api-request-*.json for tool calls
```

### Testing OAuth Flows

```bash
# Google OAuth
# 1. Get client credentials from Google Cloud Console
# 2. Add to Settings → Google OAuth
# 3. Click "Authorize"
# 4. Complete browser flow
# 5. Check token status (should show expiry time)

# MCP OAuth
# 1. Configure OAuth-enabled MCP server
# 2. Attempt connection
# 3. Browser opens for authorization
# 4. Complete flow
# 5. Check connection status (should reconnect with tokens)
```

## Troubleshooting

### "Electron failed to install correctly"

```bash
# Cause: pnpm blocked build scripts
rm -rf node_modules
pnpm install
pnpm approve-builds  # Select electron, esbuild
pnpm dev
```

### MCP Server Won't Connect

```bash
# 1. Check command/URL is correct
# 2. Check timeout (increase if needed)
# 3. Check logs in DevTools console
# 4. Test command manually:
node path/to/server.js  # For STDIO
curl <url>             # For SSE/HTTP

# 5. Check environment variables
# 6. Try reconnecting via UI
```

### Streaming Stops Mid-Response

```bash
# Possible causes:
# 1. Network timeout → Check internet connection
# 2. API rate limit → Wait and retry
# 3. Model error → Check API logs
# 4. Token limit exceeded → Enable message pruning (on by default)

# Check API logs (if enabled):
ls /tmp/groq-api-request-*.json
```

### Chat History Not Saving

```bash
# 1. Check userData directory permissions
# 2. Check disk space
# 3. Check console for errors
# 4. Verify currentChatId is set

# Manual inspection:
ls ~/Library/Application\ Support/Groq\ Desktop/chat-history/  # macOS
ls %APPDATA%/Groq Desktop/chat-history/                       # Windows
ls ~/.config/Groq\ Desktop/chat-history/                      # Linux
```

### Build Errors

```bash
# Vite build fails
pnpm build          # Check output for errors
# Common: Missing dependencies, syntax errors

# Electron build fails
pnpm build:electron # Check electron-builder output
# Common: Icon missing, code signing issues, platform-specific errors

# Platform-specific builds require:
# macOS → macOS host (or CI)
# Windows → Windows host or Wine
# Linux → Linux host or Docker
```

## Deployment

### Building Distributable

```bash
# 1. Update version in package.json
{
  "version": "1.0.1"
}

# 2. Build for target platform
pnpm dist:mac    # macOS
pnpm dist:win    # Windows
pnpm dist:linux  # Linux

# 3. Outputs in release/
# macOS: Groq Desktop-1.0.1.dmg
# Windows: Groq Desktop Setup 1.0.1.exe, Groq Desktop 1.0.1.exe (portable)
# Linux: groq-desktop-1.0.1.AppImage, groq-desktop_1.0.1_amd64.deb, groq-desktop-1.0.1.x86_64.rpm
```

### Code Signing

```bash
# macOS
# Set in environment or electron-builder.yml
CSC_LINK=/path/to/certificate.p12
CSC_KEY_PASSWORD=password

# Windows
# Set in electron-builder.yml
win:
  certificateFile: /path/to/certificate.pfx
  certificatePassword: password

# Or use environment variables
CSC_LINK=/path/to/certificate.pfx
CSC_KEY_PASSWORD=password
```

### Auto-Update (Not Configured)

```javascript
// To add auto-update:
// 1. Install electron-updater
pnpm add electron-updater

// 2. Configure in electron/main.js
const { autoUpdater } = require('electron-updater');
autoUpdater.checkForUpdatesAndNotify();

// 3. Configure in electron-builder.yml
publish:
  provider: github
  owner: your-org
  repo: groq-desktop-beta

// 4. Publish releases to GitHub
# electron-builder will generate update files
```

## Key Files Reference

### Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts, Electron Builder config |
| `vite.config.cjs` | Vite bundler configuration |
| `electron-builder.yml` | Electron Builder packaging settings |
| `tailwind.config.cjs` | Tailwind CSS configuration |
| `postcss.config.cjs` | PostCSS configuration |
| `eslint.config.js` | ESLint rules (flat config) |
| `pnpm-workspace.yaml` | pnpm workspace settings |

### Entry Points

| File | Purpose |
|------|---------|
| `electron/main.js` | Electron main process entry |
| `electron/preload.js` | Context bridge (security) |
| `src/renderer/main.jsx` | React app entry |
| `src/renderer/App.jsx` | Main React component |
| `index.html` | HTML entry point |

### Core Modules

| File | Purpose |
|------|---------|
| `electron/chatHandler.js` | Groq API communication |
| `electron/mcpManager.js` | MCP server lifecycle |
| `electron/toolHandler.js` | Tool execution |
| `electron/authManager.js` | MCP OAuth flows |
| `electron/googleOAuthManager.js` | Google OAuth refresh |
| `electron/chatHistoryManager.js` | Chat persistence |
| `electron/settingsManager.js` | Settings persistence |
| `electron/commandResolver.js` | Platform-aware commands |
| `electron/messageUtils.js` | Message pruning |
| `shared/models.js` | Model configurations |

### React Components

| File | Purpose |
|------|---------|
| `src/renderer/App.jsx` | Main app orchestration |
| `src/renderer/context/ChatContext.jsx` | Global chat state |
| `src/renderer/pages/Settings.jsx` | Settings UI |
| `src/renderer/components/ChatInput.jsx` | Message input |
| `src/renderer/components/MessageList.jsx` | Message display |
| `src/renderer/components/Message.jsx` | Individual message |
| `src/renderer/components/ToolsPanel.jsx` | MCP tools UI |
| `src/renderer/components/ToolApprovalModal.jsx` | Tool permissions |

## Resources

### Official Documentation
- **Electron:** https://www.electronjs.org/docs
- **React:** https://react.dev/
- **Vite:** https://vitejs.dev/
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Groq API:** https://console.groq.com/docs
- **MCP Specification:** https://modelcontextprotocol.io/

### Key Dependencies
- **groq-sdk:** https://github.com/groq/groq-typescript
- **@modelcontextprotocol/sdk:** https://github.com/modelcontextprotocol/sdk
- **electron-builder:** https://www.electron.build/
- **React Router:** https://reactrouter.com/

### Community
- **GitHub Issues:** https://github.com/groq/groq-desktop-beta/issues
- **Groq Discord:** https://groq.com/discord

---

## Quick Reference: Common Patterns

### IPC Call
```javascript
// Renderer
const result = await window.electron.someFunction(arg);

// Main
ipcMain.handle('some-function', async (event, arg) => { return result; });

// Preload
contextBridge.exposeInMainWorld('electron', {
  someFunction: (arg) => ipcRenderer.invoke('some-function', arg)
});
```

### Add Message to Chat
```javascript
const { messages, setMessagesWithSave } = useContext(ChatContext);

const newMessage = {
  role: 'user',
  content: 'Hello!'
};

setMessagesWithSave([...messages, newMessage]);
// Auto-saves to disk
```

### Execute Tool
```javascript
const toolCall = {
  id: 'call_123',
  type: 'function',
  function: { name: 'tool_name', arguments: '{"param": "value"}' }
};

const result = await window.electron.executeToolCall(toolCall);
// Returns: { role: 'tool', tool_call_id: 'call_123', content: '...' }
```

### Get/Update Settings
```javascript
// Get
const settings = await window.electron.getSettings();

// Update
settings.someKey = 'newValue';
await window.electron.saveSettings(settings);
```

### Connect MCP Server
```javascript
await window.electron.connectMCPServer(serverId);

// Check status
const status = await window.electron.getMCPStatus();
console.log(status[serverId]); // { status: 'connected', tools: [...] }
```

---

**Last Updated:** 2025-12-09
**Version:** Based on groq-desktop-beta at commit 342f3e9
