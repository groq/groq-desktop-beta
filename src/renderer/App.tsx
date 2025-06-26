import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import MessageList, { ChatMessage } from './components/MessageList';
import ChatInput from './components/ChatInput';
import ToolsPanel from './components/ToolsPanel';
import ToolApprovalModal from './components/ToolApprovalModal';
import { useChat } from './context/ChatContext';
import SessionManager from './components/SessionManager';

// Types for MCPTool
interface MCPTool {
  id: string;
  name: string;
  description: string;
  serverId?: string;
  input_schema?: Record<string, any>;
}

// Types for model configurations
interface ModelConfig {
  context: number;
  vision_supported: boolean;
}

// Types for server status
interface ServerStatus {
  loading: boolean;
  message: string;
}

// Tool call types
interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

// Tool response message
interface ToolResponseMessage extends ChatMessage {
  role: 'tool';
  tool_call_id: string;
}

// Paused chat state
interface PausedChatState {
  currentMessages: ChatMessage[];
  finalAssistantMessage: ChatMessage;
  accumulatedResponses: ToolResponseMessage[];
}

// Chat turn result
interface ChatTurnResult {
  status: 'completed_no_tools' | 'completed_with_tools' | 'paused' | 'error';
  assistantMessage: ChatMessage | null;
  toolResponseMessages: ToolResponseMessage[];
}

// Stream handler type
interface StreamHandler {
  onStart: (callback: (data: any) => void) => void;
  onContent: (callback: (data: { content: string }) => void) => void;
  onToolCalls: (callback: (data: { tool_calls: ToolCall[] }) => void) => void;
  onComplete: (callback: (data: any) => void) => void;
  onError: (callback: (data: { error: string }) => void) => void;
  cleanup: () => void;
}

// LocalStorage keys
const TOOL_APPROVAL_PREFIX = 'tool_approval_';
const YOLO_MODE_KEY = 'tool_approval_yolo_mode';

// --- LocalStorage Helper Functions ---
const getToolApprovalStatus = (toolName: string): 'yolo' | 'always' | 'prompt' => {
  try {
    const yoloMode = localStorage.getItem(YOLO_MODE_KEY);
    if (yoloMode === 'true') {
      return 'yolo';
    }
    const toolStatus = localStorage.getItem(`${TOOL_APPROVAL_PREFIX}${toolName}`);
    if (toolStatus === 'always') {
      return 'always';
    }
    // Default: prompt the user
    return 'prompt';
  } catch (error) {
    console.error("Error reading tool approval status from localStorage:", error);
    return 'prompt'; // Fail safe: prompt user if localStorage fails
  }
};

const setToolApprovalStatus = (toolName: string, status: 'yolo' | 'always' | 'once' | 'deny'): void => {
  try {
    if (status === 'yolo') {
      localStorage.setItem(YOLO_MODE_KEY, 'true');
    } else if (status === 'always') {
      localStorage.setItem(`${TOOL_APPROVAL_PREFIX}${toolName}`, 'always');
      // Ensure YOLO mode is off if a specific tool is set to always
      localStorage.removeItem(YOLO_MODE_KEY);
    } else if (status === 'once' || status === 'deny') {
      // These don't change persistent storage, just clear YOLO mode
      localStorage.removeItem(YOLO_MODE_KEY);
    }
  } catch (error) {
    console.error("Error writing tool approval status to localStorage:", error);
  }
};
// --- End LocalStorage Helper Functions ---

const App: React.FC = () => {
  // Use context state
  const { 
    messages, 
    setMessages, 
    clearMessages, 
    isLoading, 
    setIsLoading 
  } = useChat();
  
  // Local state
  const [selectedModel, setSelectedModel] = useState<string>('llama-3.3-70b-versatile');
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [mcpServersStatus, setMcpServersStatus] = useState<ServerStatus>({ loading: false, message: "" });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Model configurations
  const [modelConfigs, setModelConfigs] = useState<Record<string, ModelConfig>>({});
  const [models, setModels] = useState<string[]>([]);
  
  // Vision support flag
  const [visionSupported, setVisionSupported] = useState<boolean>(false);
  // Initial load state
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  
  // Tool approval state
  const [pendingApprovalCall, setPendingApprovalCall] = useState<ToolCall | null>(null);
  const [pausedChatState, setPausedChatState] = useState<PausedChatState | null>(null);
  
  // New chat confirmation modal
  const [showNewChatConfirm, setShowNewChatConfirm] = useState<boolean>(false);

  // Remove last message handler
  const handleRemoveLastMessage = () => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      // Create a copy without the last message
      return prev.slice(0, prev.length - 1);
    });
  };

  // Server status update function
  const updateServerStatus = (tools: MCPTool[], settings: any) => {
    try {
      // Get number of configured servers
      if (settings && settings.mcpServers) {
        const configuredCount = Object.keys(settings.mcpServers).length;
        
        // Get unique server IDs from the tools
        const connectedServerIds = new Set<string>();
        if (Array.isArray(tools)) {
          tools.forEach(tool => {
            if (tool && tool.serverId) {
              connectedServerIds.add(tool.serverId);
            }
          });
        }
        const connectedCount = connectedServerIds.size;
        const toolCount = Array.isArray(tools) ? tools.length : 0;
        
        if (configuredCount > 0) {
          if (connectedCount === configuredCount) {
            setMcpServersStatus({ 
              loading: false, 
              message: `${toolCount} tools, ${connectedCount}/${configuredCount} MCP servers connected` 
            });
          } else if (connectedCount > 0) {
            setMcpServersStatus({ 
              loading: false, 
              message: `${toolCount} tools, ${connectedCount}/${configuredCount} MCP servers connected` 
            });
          } else {
            setMcpServersStatus({ 
              loading: false, 
              message: `${toolCount} tools, No MCP servers connected (${configuredCount} configured)` 
            });
          }
        } else {
          setMcpServersStatus({ loading: false, message: `${toolCount} tools, No MCP servers configured` });
        }
      } else {
        const toolCount = Array.isArray(tools) ? tools.length : 0;
        setMcpServersStatus({ loading: false, message: `${toolCount} tools available` });
      }
    } catch (error) {
      console.error('Error updating server status:', error);
      setMcpServersStatus({ loading: false, message: "Error updating server status" });
    }
  };

  // Load settings, MCP tools, and model configs when component mounts
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Set loading status
        setMcpServersStatus({ loading: true, message: "Connecting to MCP servers..." });

        // Load model configurations first
        const configs = await window.electron.getModelConfigs();
        setModelConfigs(configs);
        const availableModels = Object.keys(configs).filter(key => key !== 'default');
        setModels(availableModels); // Set models list

        // THEN Load settings
        const settings = await window.electron.getSettings();
        let effectiveModel = availableModels.length > 0 ? availableModels[0] : 'default'; // Default fallback

        if (settings && settings.model) {
          // Ensure the saved model is still valid against the loaded configs
          if (configs[settings.model]) {
            effectiveModel = settings.model; // Use saved model if valid
          } else {
            // If saved model is invalid, keep the default fallback (first available model)
            console.warn(`Saved model "${settings.model}" not found in loaded configs. Falling back to ${effectiveModel}.`);
          }
        } else if (availableModels.length > 0) {
          // If no model saved in settings, but models are available, use the first one
          effectiveModel = availableModels[0];
        }
        // If no model in settings and no available models, effectiveModel remains 'default'

        setSelectedModel(effectiveModel); // Set the final selected model state

        // Initial load of MCP tools (can happen after model/settings)
        const mcpToolsResult = await window.electron.getMcpTools();
        // Use the already loaded settings object here for initial status update
        if (mcpToolsResult && mcpToolsResult.tools) {
          setMcpTools(mcpToolsResult.tools);
          updateServerStatus(mcpToolsResult.tools, settings); // Pass loaded settings
        } else {
          // Handle case where no tools are found initially, but update status
          updateServerStatus([], settings);
        }

        // Set up event listener for MCP server status changes
        const removeListener = window.electron.onMcpServerStatusChanged((data: { tools: MCPTool[] }) => {
          if (data && data.tools !== undefined) { // Check if tools property exists
            setMcpTools(data.tools);
            // Fetch latest settings again when status changes, as they might have been updated
            window.electron.getSettings().then(currentSettings => {
              updateServerStatus(data.tools, currentSettings);
            }).catch(err => {
              console.error("Error fetching settings for status update:", err);
              // Fallback to updating status without settings info
              updateServerStatus(data.tools, null);
            });
          }
        });

        // Clean up the event listener when component unmounts
        return () => {
          if (removeListener) removeListener();
        };
      } catch (error) {
        console.error('Error loading initial data:', error);
        setMcpServersStatus({ loading: false, message: "Error loading initial data" });
      } finally {
        // Mark initial load as complete regardless of success/failure
        setInitialLoadComplete(true);
      }
    };

    loadInitialData();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Save model selection to settings when it changes, ONLY after initial load
  useEffect(() => {
    // Prevent saving during initial setup before models/settings are loaded/validated
    if (!initialLoadComplete) {
      return;
    }

    // Also ensure models list isn't empty and selectedModel is valid
    if (models.length === 0 || !selectedModel) {
      console.warn("Skipping model save: Models not loaded or no model selected.");
      return;
    }

    const saveModelSelection = async () => {
      try {
        console.log(`Attempting to save selected model: ${selectedModel}`); // Debug log
        const settings = await window.electron.getSettings();
        // Check if the model actually changed before saving
        if (settings.model !== selectedModel) {
          console.log(`Saving new model selection: ${selectedModel}`);
          await window.electron.saveSettings({ ...settings, model: selectedModel });
        } else {
          // console.log("Model selection hasn't changed, skipping save.");
        }
      } catch (error) {
        console.error('Error saving model selection:', error);
      }
    };

    saveModelSelection();
    // Depend on initialLoadComplete as well to trigger after load finishes
  }, [selectedModel, initialLoadComplete, models]);

  // Scroll to the bottom of the messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Trigger scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Execute a single tool call
  const executeToolCall = async (toolCall: ToolCall): Promise<ToolResponseMessage> => {
    try {
      const response = await window.electron.executeToolCall(toolCall);
      
      // Return the tool response message in the correct format
      return {
        role: 'tool' as const,
        content: response.error ? JSON.stringify({ error: response.error }) : (response.result || ''),
        tool_call_id: toolCall.id
      } as ToolResponseMessage;
    } catch (error: any) {
      console.error('Error executing tool call:', error);
      return { 
        role: 'tool' as const, 
        content: JSON.stringify({ error: error.message }),
        tool_call_id: toolCall.id
      } as ToolResponseMessage;
    }
  };

  // Process multiple tool calls and handle approval flow
  const processToolCalls = async (
    assistantMessage: ChatMessage, 
    currentMessagesBeforeAssistant: ChatMessage[]
  ): Promise<{ status: 'completed' | 'paused'; toolResponseMessages: ToolResponseMessage[] }> => {
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return { status: 'completed', toolResponseMessages: [] };
    }

    const toolResponseMessages: ToolResponseMessage[] = [];
    let needsPause = false;

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const approvalStatus = getToolApprovalStatus(toolName);

      if (approvalStatus === 'always' || approvalStatus === 'yolo') {
        console.log(`Tool '${toolName}' automatically approved (${approvalStatus}). Executing...`);
        try {
          const resultMsg = await executeToolCall(toolCall);
          toolResponseMessages.push(resultMsg);
          // Update UI immediately for executed tool calls
          setMessages(prev => [...prev, resultMsg]);
        } catch (error) {
          console.error(`Error executing automatically approved tool call '${toolName}':`, error);
          const errorMsg: ToolResponseMessage = {
            role: 'tool',
            content: JSON.stringify({ error: `Error executing tool '${toolName}': ${error instanceof Error ? error.message : String(error)}` }),
            tool_call_id: toolCall.id
          };
          toolResponseMessages.push(errorMsg);
          setMessages(prev => [...prev, errorMsg]); // Show error in UI
        }
      } else { // status === 'prompt'
        console.log(`Tool '${toolName}' requires user approval.`);
        setPendingApprovalCall(toolCall);
        setPausedChatState({
          currentMessages: currentMessagesBeforeAssistant, // History before this assistant message
          finalAssistantMessage: assistantMessage,
          accumulatedResponses: toolResponseMessages // Responses gathered *before* this pause
        });
        needsPause = true;
        break; // Stop processing further tools for this turn
      }
    }

    if (needsPause) {
      return { status: 'paused', toolResponseMessages };
    } else {
      return { status: 'completed', toolResponseMessages };
    }
  };

  // Update vision support when selectedModel or modelConfigs changes
  useEffect(() => {
    if (modelConfigs && selectedModel && modelConfigs[selectedModel]) {
      const capabilities = modelConfigs[selectedModel] || modelConfigs['default'];
      setVisionSupported(capabilities.vision_supported);
    } else {
      // Handle case where configs aren't loaded yet or model is invalid
      setVisionSupported(false);
    }
  }, [selectedModel, modelConfigs]);

  // Core function to execute a chat turn (fetch response, handle tools)
  const executeChatTurn = async (turnMessages: ChatMessage[]): Promise<ChatTurnResult> => {
    let currentTurnStatus: 'completed_no_tools' | 'completed_with_tools' | 'paused' | 'error' = 'completed_no_tools';
    let turnAssistantMessage: ChatMessage | null = null;
    let turnToolResponses: ToolResponseMessage[] = [];

    try {
      // Create a streaming assistant message placeholder
      const assistantPlaceholder: ChatMessage = {
        role: 'assistant',
        content: '',
        isStreaming: true
      };
      setMessages(prev => [...prev, assistantPlaceholder]);

      // Start streaming chat
      const streamHandler = window.electron.chatStream(turnMessages, selectedModel);

      // Collect the final message data
      let finalAssistantData: ChatMessage = {
        role: 'assistant',
        content: '',
        tool_calls: [] as ToolCall[],
        reasoning: undefined
      };

      // Setup event handlers for streaming
      streamHandler.onStart(() => { /* Placeholder exists */ });

      streamHandler.onContent(({ content }: { content: string }) => {
        finalAssistantData.content += content;
        setMessages(prev => {
          const newMessages = [...prev];
          const idx = newMessages.findIndex(msg => msg.role === 'assistant' && msg.isStreaming);
          if (idx !== -1) {
            newMessages[idx] = { ...newMessages[idx], content: finalAssistantData.content };
          }
          return newMessages;
        });
      });

      streamHandler.onToolCalls(({ tool_calls }: { tool_calls: ToolCall[] }) => {
        finalAssistantData.tool_calls = tool_calls;
        setMessages(prev => {
          const newMessages = [...prev];
          const idx = newMessages.findIndex(msg => msg.role === 'assistant' && msg.isStreaming);
          if (idx !== -1) {
            newMessages[idx] = { ...newMessages[idx], tool_calls: finalAssistantData.tool_calls };
          }
          return newMessages;
        });
      });

      // Handle stream completion
      await new Promise<void>((resolve, reject) => {
        streamHandler.onComplete((data: any) => {
          finalAssistantData = {
            role: 'assistant',
            content: data.content || '',
            tool_calls: data.tool_calls,
            reasoning: data.reasoning
          };
          turnAssistantMessage = finalAssistantData; // Store the completed message

          setMessages(prev => {
            const newMessages = [...prev];
            const idx = newMessages.findIndex(msg => msg.role === 'assistant' && msg.isStreaming);
            if (idx !== -1) {
              newMessages[idx] = finalAssistantData; // Replace placeholder
            } else {
              // Should not happen if placeholder logic is correct
              console.warn("Streaming placeholder not found for replacement.");
              newMessages.push(finalAssistantData);
            }
            return newMessages;
          });
          resolve();
        });

        streamHandler.onError(({ error }: { error: string }) => {
          console.error('Stream error:', error);
          // Replace placeholder with error
          setMessages(prev => {
            const newMessages = [...prev];
            const idx = newMessages.findIndex(msg => msg.role === 'assistant' && msg.isStreaming);
            const errorMsg: ChatMessage = { role: 'assistant', content: `Stream Error: ${error}`, isStreaming: false };
            if (idx !== -1) {
              newMessages[idx] = errorMsg;
            } else {
              newMessages.push(errorMsg);
            }
            return newMessages;
          });
          reject(new Error(error));
        });
      });

      // Clean up stream handlers
      streamHandler.cleanup();

      // Check and process tool calls if any
      if (turnAssistantMessage && turnAssistantMessage.tool_calls?.length > 0) {
        // IMPORTANT: Pass the messages *before* this assistant message was added
        const { status: toolProcessingStatus, toolResponseMessages } = await processToolCalls(
          turnAssistantMessage,
          turnMessages // Pass the input messages for this turn
        );

        turnToolResponses = toolResponseMessages; // Store responses from this turn

        if (toolProcessingStatus === 'paused') {
          currentTurnStatus = 'paused'; // Signal pause to the caller
        } else if (toolProcessingStatus === 'completed') {
          // If tools completed, the caller might loop
          currentTurnStatus = 'completed_with_tools';
        } else { // Handle potential errors from processToolCalls if added
          currentTurnStatus = 'error';
        }
      } else {
        // No tools, this turn is complete
        currentTurnStatus = 'completed_no_tools';
      }
    } catch (error) {
      console.error('Error in executeChatTurn:', error);
      // Ensure placeholder is replaced or an error message is added
      setMessages(prev => {
        const newMessages = [...prev];
        const idx = newMessages.findIndex(msg => msg.role === 'assistant' && msg.isStreaming);
        const errorMsg: ChatMessage = { 
          role: 'assistant', 
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          isStreaming: false 
        };
        if (idx !== -1) {
          newMessages[idx] = errorMsg;
        } else {
          // If streaming never started, add the error message
          newMessages.push(errorMsg);
        }
        return newMessages;
      });
      currentTurnStatus = 'error';
    }

    // Return the outcome of the turn
    return {
      status: currentTurnStatus,
      assistantMessage: turnAssistantMessage,
      toolResponseMessages: turnToolResponses,
    };
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* App content will be implemented in the next steps */}
      <div>Converting to TypeScript...</div>
    </div>
  );
};

export default App; 