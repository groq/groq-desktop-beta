import React, { useState } from 'react';
import ToolCall from './ToolCall';
import MarkdownRenderer from './MarkdownRenderer';

function Message({ message, children, onToolCallExecute, allMessages, isLastMessage }) {
  const { role, tool_calls, reasoning, isStreaming, executed_tools, liveReasoning, liveExecutedTools } = message;
  const [showReasoning, setShowReasoning] = useState(false);
  const [showExecutedTools, setShowExecutedTools] = useState(false);
  const [collapsedOutputs, setCollapsedOutputs] = useState(new Set()); // Track which tool outputs are collapsed
  const isUser = role === 'user';
  const hasReasoning = (reasoning || liveReasoning) && !isUser;
  const hasExecutedTools = (executed_tools?.length > 0 || liveExecutedTools?.length > 0) && !isUser;
  const isStreamingMessage = isStreaming === true;
  
  // Get current reasoning and tools (live or final)
  const currentReasoning = liveReasoning || reasoning;
  const currentTools = liveExecutedTools?.length > 0 ? liveExecutedTools : executed_tools;

  console.log("Message", message.content);

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
  const bubbleStyle = isUser ? 'bg-gray-200' : ''; // No background for assistant/system
  const bubbleClasses = isUser
    ? `relative overflow-x-auto px-4 py-3 rounded-lg max-w-xl max-h-[500px] overflow-y-auto cursor-pointer ${bubbleStyle}`
    : `relative overflow-x-auto my-3 py-3 w-full border-b border-gray-300`; // Assistant bubbles full-width, no background
  const wrapperClasses = `message-content-wrapper ${isUser ? 'text-black' : 'text-black'} break-words`; // Keep text white for both, use break-words

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
        {!isUser && (hasReasoning || hasExecutedTools) && (
          <div className="pb-5 border-b border-gray-300 space-y-2">
            <div className="flex flex-wrap gap-2">
              {/* Reasoning dropdown - blue */}
              {hasReasoning && (
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
            
            {/* Reasoning content */}
            {(showReasoning || (isStreamingMessage && liveReasoning)) && currentReasoning && (
              <div className="p-3 bg-blue-50 rounded-md text-md ">
                <div className="whitespace-pre-wrap break-words text-blue-900">
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
        {tool_calls && tool_calls.map((toolCall, index) => (
          <ToolCall 
            key={toolCall.id || index} 
            toolCall={toolCall} 
            toolResult={findToolResult(toolCall.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default Message;
