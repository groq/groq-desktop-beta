interface ElectronAPI {
  // Chat and messaging
  getMcpTools: () => Promise<{ tools: any[] }>;
  chatStream: (messages: any[], model: string) => void;
  onChatStreamStart: (callback: (data: any) => void) => () => void;
  onChatStreamContent: (callback: (data: any) => void) => () => void;
  onChatStreamToolCalls: (callback: (data: any) => void) => () => void;
  onChatStreamComplete: (callback: (data: any) => void) => () => void;
  onChatStreamError: (callback: (data: any) => void) => () => void;
  executeToolCall: (toolCall: any) => Promise<any>;
  
  // Settings
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<void>;
  reloadSettings: () => Promise<any>;
  getModelConfigs: () => Promise<Record<string, any>>;
  
  // MCP servers
  onMcpServerStatusChanged: (callback: (data: any) => void) => () => void;
  connectMcpServer: (serverId: string) => Promise<void>;
  disconnectMcpServer: (serverId: string) => Promise<void>;
  
  // System
  openExternalLink: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  openLogs: () => Promise<void>;
  getLogsContent: () => Promise<string>;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {}; 