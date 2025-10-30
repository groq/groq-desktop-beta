import React, { useState, useRef, useEffect } from 'react';
import ToolCall from './ToolCall';
import MarkdownRenderer from './MarkdownRenderer';
import { TextShimmer } from './ui/text-shimmer';

function Message({ message, children, onToolCallExecute, allMessages, isLastMessage, messageIndex, onReloadFromMessage, loading, onActionsVisible }) {
  const { role, tool_calls, reasoning, isStreaming, executed_tools, liveReasoning, liveExecutedTools, reasoningSummaries, reasoningDuration, usage } = message;
  const [showReasoning, setShowReasoning] = useState(false);
  const [showExecutedTools, setShowExecutedTools] = useState(false);
  const [collapsedOutputs, setCollapsedOutputs] = useState(new Set()); // Track which tool outputs are collapsed
  const [copySuccess, setCopySuccess] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const wasStreamingRef = useRef(false);
  const actionTimeoutRef = useRef(null);
  
  const isUser = role === 'user';
  const hasReasoning = (reasoning || liveReasoning) && !isUser;
  const hasExecutedTools = (executed_tools?.length > 0 || liveExecutedTools?.length > 0) && !isUser;
  const isStreamingMessage = isStreaming === true;
  const hasReasoningSummaries = reasoningSummaries && reasoningSummaries.length > 0;
  // Reasoning is complete if we have a duration (even while still streaming) OR if stream ended with reasoning
  const isReasoningComplete = (reasoningDuration && hasReasoning) || (!isStreamingMessage && hasReasoning);
  
  // Get current reasoning and tools (live or final)
  const currentReasoning = liveReasoning || reasoning;
  const currentTools = liveExecutedTools?.length > 0 ? liveExecutedTools : executed_tools;
  
  // Auto-collapse when streaming finishes
  useEffect(() => {
    if (wasStreamingRef.current && !isStreamingMessage) {
      // Streaming just finished, auto-collapse
      setShowReasoning(false);
    }
    wasStreamingRef.current = isStreamingMessage;
  }, [isStreamingMessage]);

  // Debounced show actions - only show when not loading and is last message
  useEffect(() => {
    // Clear any existing timeout
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
    }

    // Hide actions immediately if loading or not last message
    if (loading || !isLastMessage || isStreamingMessage) {
      setShowActions(false);
      return;
    }

    // Debounce showing actions by 300ms
    actionTimeoutRef.current = setTimeout(() => {
      setShowActions(true);
    }, 300);

    // Cleanup
    return () => {
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
      }
    };
  }, [loading, isLastMessage, isStreamingMessage]);

  // Scroll to bottom when actions become visible
  useEffect(() => {
    if (showActions && onActionsVisible) {
      // Use a small delay to ensure the DOM has updated with the new buttons
      setTimeout(() => {
        onActionsVisible(true); // Pass true for instant scroll
      }, 50);
    }
  }, [showActions, onActionsVisible]);

  // Find tool results for this message's tool calls in the messages array
  const findToolResult = (toolCallId) => {
    if (!allMessages) return null;
    
    // Look for a tool message that matches this tool call ID
    const toolMessage = allMessages.find(
      msg => msg.role === 'tool' && msg.tool_call_id === toolCallId
    );
    
    return toolMessage ? toolMessage.content : null;
  };

  const messageClasses = `flex ${isUser ? 'justify-end' : 'justify-start'}`;
  // Apply background only for user messages
  const bubbleStyle = isUser ? 'bg-[#E9E9DF]' : ''; // No background for assistant/system
  const bubbleClasses = isUser
    ? `relative overflow-x-auto px-4 py-3 rounded-lg max-w-xl max-h-[500px] overflow-y-auto cursor-pointer ${bubbleStyle}`
    : `relative overflow-x-auto w-full`; // Assistant bubbles full-width, no background
  const wrapperClasses = `message-content-wrapper ${isUser ? 'text-black' : 'text-black'} break-words text-sm`; // Keep text white for both, use break-words, smaller font

  const toggleReasoning = () => setShowReasoning(!showReasoning);
  const toggleExecutedTools = () => setShowExecutedTools(!showExecutedTools);
  
  const toggleOutputCollapse = (toolIndex) => {
    setCollapsedOutputs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolIndex)) {
        newSet.delete(toolIndex);
      } else {
        newSet.add(toolIndex);
      }
      return newSet;
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  // By default, collapse outputs. Show them only if explicitly expanded
  const isOutputCollapsed = (toolIndex) => {
    // Default to collapsed unless explicitly expanded (both during and after streaming)
    return !collapsedOutputs.has(toolIndex);
  };

  return (
    <div className={messageClasses}>
      <div className={bubbleClasses}>
        {isStreamingMessage && (
          <div className="streaming-indicator mb-1">
            <span className="dot-1"></span>
            <span className="dot-2"></span>
            <span className="dot-3"></span>
          </div>
        )}

        {/* Simple dropdowns - always visible when content exists */}
        {!isUser && (hasReasoning || hasExecutedTools || hasReasoningSummaries) && (
          <div className="pb-5 space-y-2">
            <div className="flex flex-wrap gap-2">
              {/* Reasoning summaries - displayed as activity lines while streaming AND reasoning not yet complete */}
              {/* Hide shimmer if content has started streaming, even if reasoningDuration not set yet */}
              {/* Only show the most recent summary to avoid multiple shimmering texts */}
              {hasReasoningSummaries && isStreamingMessage && !reasoningDuration && !message.content && (
                <div className="flex flex-col gap-1.5 w-full mb-2">
                  {(() => {
                    const latestSummary = reasoningSummaries[reasoningSummaries.length - 1];
                    return (
                      <div 
                        key={latestSummary.index}
                        className="flex items-center text-sm"
                      >
                        <TextShimmer 
                          as="span" 
                          duration={2.5} 
                          spread={3}
                          className="text-sm font-medium text-gray-700"
                        >
                          {latestSummary.summary}
                        </TextShimmer>
                      </div>
                    );
                  })()}
                </div>
              )}
              
              {/* When reasoning completes, show "Thought for Xs" toggle (can happen while still streaming content) */}
              {hasReasoningSummaries && isReasoningComplete && reasoningDuration != null && (
                <button 
                  onClick={toggleReasoning}
                  className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors duration-200 cursor-pointer bg-transparent border-none p-0"
                >
                  <span>Thought for {reasoningDuration}s</span>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-3 w-3 ml-1 transition-transform duration-200 ${showReasoning ? 'rotate-90' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              
              {/* Reasoning dropdown - blue (only show if no summaries, for backward compatibility) */}
              {hasReasoning && !hasReasoningSummaries && (
                <button 
                  onClick={toggleReasoning}
                  className="flex items-center text-sm px-3 py-1 rounded-md bg-blue-100 hover:bg-blue-200 text-blue-800 transition-colors duration-200"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-10 w-4 mr-1 transition-transform duration-200 ${showReasoning ? 'rotate-90' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {isStreamingMessage && liveReasoning ? 'Thinking...' : 'Show reasoning'}
                  {isStreamingMessage && liveReasoning && (
                    <svg className="animate-spin ml-2 h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                </button>
              )}
              
              {/* Tool execution dropdown - green */}
              {hasExecutedTools && (
                <button 
                  onClick={toggleExecutedTools}
                  className="flex items-center text-sm px-3 py-1 rounded-md bg-green-100 hover:bg-green-200 text-green-800 transition-colors duration-200"
                >
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className={`h-4 w-4 mr-1 transition-transform duration-200 ${showExecutedTools ? 'rotate-90' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {`Built in tool calling [${currentTools?.length || 0}]`}
                  {isStreamingMessage && currentTools?.some(t => !t.output) && (
                    <svg className="animate-spin ml-2 h-4 w-4 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                </button>
              )}
            </div>
            
            {/* Reasoning content - only show when toggled (not during streaming if we have summaries) */}
            {showReasoning && currentReasoning && (
              <div 
                className="mt-2 text-md transition-all duration-200 max-h-[600px] overflow-y-auto reasoning-content"
              >
                <div className="whitespace-pre-wrap break-words italic text-gray-700">
                  <MarkdownRenderer
                    content={currentReasoning
                      .replace(/<tool[^>]*>([\s\S]*?)<\/tool>/gi, '**Tool call:**\n```$1```')
                      .replace(/<output[^>]*>([\s\S]*?)<\/output>/gi, '**Tool output:**\n $1')
                      .replace(/<think[^>]*>([\s\S]*?)<\/think>/gi, '### **Thought process:** $1')
                    }
                    disableMath={true}
                  />
                </div>
              </div>
            )}
            
            {/* Tool execution content */}
            {showExecutedTools && currentTools?.length > 0 && (
              <div className="space-y-2">
                {currentTools.map((tool, index) => {
                  const isLive = liveExecutedTools?.length > 0;
                  return (
                    <div key={`tool-${tool.index || index}`} className={`p-3 rounded-md text-sm border ${isLive ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className={`font-semibold mb-2 ${isLive ? 'text-green-800' : 'text-gray-800'}`}>
                        {tool.type === 'python' ? '🐍 Python Code' : `🔧 ${tool.type || 'Tool'}`}
                        {tool.name && (
                          <span className={`ml-2 font-normal text-sm ${isLive ? 'text-green-700' : 'text-gray-700'}`}>
                            ({tool.name})
                          </span>
                        )}
                        {isLive ? (
                          !tool.output ? (
                            <span className="ml-2 text-green-600">Executing...</span>
                          ) : (
                            <span className="ml-2 text-green-600">✓ Complete</span>
                          )
                        ) : (
                          <span className="ml-2 text-green-600">✓ Complete</span>
                        )}
                      </div>
                      
                      {tool.arguments && (
                        <div className="mb-2">
                          <div className={`text-xs mb-1 ${isLive ? 'text-green-700' : 'text-gray-700'}`}>Code:</div>
                          <pre className={`p-2 rounded overflow-x-auto text-xs ${isLive ? 'bg-green-100 text-green-900' : 'bg-gray-100 text-gray-900'}`}>
                            {typeof tool.arguments === 'string' ? 
                              (tool.arguments.startsWith('{') ? 
                                (() => {
                                  try {
                                    return JSON.parse(tool.arguments).code || tool.arguments;
                                  } catch (e) {
                                    return tool.arguments;
                                  }
                                })() : 
                                tool.arguments
                              ) : 
                              JSON.stringify(tool.arguments, null, 2)
                            }
                          </pre>
                        </div>
                      )}
                      
                      {tool.output && (
                        <div>
                          {(() => {
                            const outputLineCount = tool.output.split('\n').length;
                            const shouldShowCollapse = outputLineCount > 10;
                            
                            if (!shouldShowCollapse) {
                              // Show output directly for 10 lines or fewer
                              return (
                                <div>
                                  <div className={`text-xs mb-1 ${isLive ? 'text-green-700' : 'text-gray-700'}`}>Output:</div>
                                  <pre className={`bg-white p-2 rounded overflow-x-auto text-xs border ${isLive ? 'text-green-900 border-green-200' : 'text-gray-900 border-gray-200'}`}>
                                    {tool.output}
                                  </pre>
                                </div>
                              );
                            }
                            
                            // Show collapse/expand for outputs with more than 10 lines
                            return (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <div className={`text-xs ${isLive ? 'text-green-700' : 'text-gray-700'}`}>Output:</div>
                                  <button
                                    onClick={() => toggleOutputCollapse(tool.index || index)}
                                    className={`text-xs px-2 py-0.5 rounded hover:bg-opacity-80 transition-colors ${
                                      isLive ? 'bg-green-200 text-green-800 hover:bg-green-300' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                                    }`}
                                  >
                                    {isOutputCollapsed(tool.index || index) ? 'Show' : 'Hide'}
                                  </button>
                                </div>
                                {isOutputCollapsed(tool.index || index) ? (
                                  <div className={`bg-white p-2 rounded text-xs border ${isLive ? 'text-green-700 border-green-200' : 'text-gray-700 border-gray-200'} italic`}>
                                    Output available (click Show to expand)
                                  </div>
                                ) : (
                                  <pre className={`bg-white p-2 rounded overflow-x-auto text-xs border ${isLive ? 'text-green-900 border-green-200' : 'text-gray-900 border-gray-200'}`}>
                                    {tool.output}
                                  </pre>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className={wrapperClasses}>
          {children}
        </div>
        
        {/* MCP tool calls */}
        {tool_calls && tool_calls.length > 0 && (
          <div className="mb-4">
            {tool_calls.map((toolCall, index) => (
              <ToolCall 
                key={toolCall.id || index} 
                toolCall={toolCall} 
                toolResult={findToolResult(toolCall.id)}
              />
            ))}
          </div>
        )}

        {/* Usage stats, copy, and reload button for the last assistant message only */}
        {!isUser && showActions && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600">
            {usage?.total_tokens && usage?.total_time && (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 370 563" fill="#F43E01" xmlns="http://www.w3.org/2000/svg">
                  <path d="M165.98 342.21H0L272.4 1.5l-68.75 220.11H369.6L97.23 562.32z"/>
                </svg>
                <span className="font-medium">
                  {Math.round(usage.total_tokens / usage.total_time)} t/s
                </span>
              </div>
            )}
            <div className="relative group">
              <button
                onClick={handleCopy}
                className="flex items-center justify-center p-1.5 rounded hover:bg-[#E9E9DF] transition-colors"
              >
                {copySuccess ? (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {copySuccess ? 'Copied!' : 'Copy'}
              </div>
            </div>
            {onReloadFromMessage && messageIndex !== undefined && (
              <div className="relative group">
                <button
                  onClick={() => onReloadFromMessage(messageIndex)}
                  className="flex items-center justify-center p-1.5 rounded hover:bg-[#E9E9DF] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Reload
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Message;
