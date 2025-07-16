import React, { useState } from 'react';
import ToolCall from './ToolCall';
import { ChatMessage } from './MessageList';

interface MessageProps {
  message: ChatMessage;
  children: React.ReactNode;
  onToolCallExecute?: (toolCall: any) => void;
  allMessages?: ChatMessage[];
  isLastMessage?: boolean;
  onRemoveMessage?: () => void;
}

const Message: React.FC<MessageProps> = ({ 
  message, 
  children, 
  onToolCallExecute, 
  allMessages, 
  isLastMessage, 
  onRemoveMessage 
}) => {
  const { role, tool_calls, reasoning, isStreaming } = message;
  const [showReasoning, setShowReasoning] = useState(false);
  const isUser = role === 'user';
  const hasReasoning = reasoning && !isUser;
  const isStreamingMessage = isStreaming === true;

  // Find tool results for this message's tool calls in the messages array
  const findToolResult = (toolCallId: string) => {
    if (!allMessages) return null;
    
    // Look for a tool message that matches this tool call ID
    const toolMessage = allMessages.find(
      msg => msg.role === 'tool' && msg.tool_call_id === toolCallId
    );
    
    // Convert content to string if it's an array
    if (toolMessage) {
      const content = toolMessage.content;
      return Array.isArray(content) ? JSON.stringify(content) : content;
    }
    
    return null;
  };

  // Message container classes
  const messageClasses = `flex items-start gap-3 my-6 ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`;
  
  // Apply background with different styling for user vs assistant
  const bubbleStyle = isUser 
    ? 'bg-user-message-bg text-white border border-gray-700' 
    : 'bg-gray-800 text-white border border-gray-700'; 
  
  // Bubble with rounded corners (more rounded on the sides)
  const bubbleClasses = `relative px-5 py-4 ${
    isUser ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'
  } max-w-xl ${bubbleStyle} group shadow-sm`; 
  
  const wrapperClasses = `message-content-wrapper break-words`; 

  const toggleReasoning = () => setShowReasoning(!showReasoning);

  // Avatar content based on role
  const Avatar = () => {
    if (isUser) {
      return (
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium shadow-sm">
          U
        </div>
      );
    } else {
      return (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-medium shadow-sm">
          G
        </div>
      );
    }
  };

  return (
    <div className={messageClasses}>
      {/* Avatar - show on left for assistant, right for user */}
      {!isUser && <Avatar />}
      
      <div className={bubbleClasses}>
        {isLastMessage && onRemoveMessage && (
          <button 
            onClick={onRemoveMessage}
            className={`absolute ${isUser ? 'right-1' : 'left-1'} top-0 -translate-y-1/2 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 z-10 shadow-sm`}
            title="Remove message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {isStreamingMessage && (
          <div className="streaming-indicator mb-1">
            <span className="dot-1"></span>
            <span className="dot-2"></span>
            <span className="dot-3"></span>
          </div>
        )}
        <div className={wrapperClasses}>
          {children}
        </div>
        
        {tool_calls && tool_calls.map((toolCall, index) => (
          <ToolCall 
            key={toolCall.id || index} 
            toolCall={toolCall} 
            toolResult={findToolResult(toolCall.id)}
          />
        ))}

        {hasReasoning && (
          <div className="reasoning-section">
            <button 
              onClick={toggleReasoning} 
              className="reasoning-toggle"
            >
              {showReasoning ? 'Hide Reasoning' : 'Show Reasoning'}
            </button>
            {showReasoning && (
              <div className="reasoning-content">
                {reasoning}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Avatar - show on right for user */}
      {isUser && <Avatar />}
    </div>
  );
};

export default Message; 