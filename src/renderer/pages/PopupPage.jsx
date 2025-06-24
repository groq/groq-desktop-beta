import React, { useState, useEffect, useRef } from 'react';

const PopupPage = () => {
  const [context, setContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [models, setModels] = useState([]);
  const [showContext, setShowContext] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load models and context on mount
  useEffect(() => {
    initializePopup();
    
    // Listen for context sent from main process
    const removeListener = window.electron.onPopupContext((popupContext) => {
      console.log('Received popup context:', popupContext);
      setContext(popupContext);
      setShowContext(true);
    });

    // Focus input on mount
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);

    return () => {
      if (removeListener) removeListener();
    };
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializePopup = async () => {
    try {
      // Load model configurations
      const modelConfigs = await window.electron.getModelConfigs();
      const availableModels = Object.keys(modelConfigs).filter(key => key !== 'default');
      setModels(availableModels);
      
      if (availableModels.length > 0) {
        setSelectedModel(availableModels[0]);
      }

      // Try to get any existing captured context
      const capturedContext = await window.electron.getCapturedContext();
      if (capturedContext) {
        setContext(capturedContext);
      }
    } catch (error) {
      console.error('Error initializing popup:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const closePopup = () => {
    window.electron.closePopup();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
      closePopup();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const useContext = () => {
    if (context && context.text) {
      setInputValue(context.text);
      setShowContext(false);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Create message with timestamp for UI
    const userMessage = {
      role: 'user',
      content: inputValue.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);

    try {
      // Create assistant message placeholder
      const assistantPlaceholder = {
        role: 'assistant',
        content: '',
        isStreaming: true
      };
      
      setMessages(prev => [...prev, assistantPlaceholder]);

      // Start streaming - send messages without timestamps
      const streamHandler = window.electron.startChatStream([...messages, userMessage], selectedModel);
      
      let finalContent = '';

      streamHandler.onContent(({ content }) => {
        finalContent += content;
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex] && newMessages[lastIndex].isStreaming) {
            newMessages[lastIndex] = {
              ...newMessages[lastIndex],
              content: finalContent
            };
          }
          return newMessages;
        });
      });

      streamHandler.onComplete((data) => {
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex] && newMessages[lastIndex].isStreaming) {
            newMessages[lastIndex] = {
              role: 'assistant',
              content: data.content || finalContent,
              isStreaming: false
            };
          }
          return newMessages;
        });
        setLoading(false);
        streamHandler.cleanup();
      });

      streamHandler.onError(({ error }) => {
        console.error('Stream error:', error);
        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (newMessages[lastIndex] && newMessages[lastIndex].isStreaming) {
            newMessages[lastIndex] = {
              role: 'assistant',
              content: `Error: ${error}`,
              isStreaming: false
            };
          }
          return newMessages;
        });
        setLoading(false);
        streamHandler.cleanup();
      });

    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error.message}`
        }
      ]);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shadow-sm">
        
        <div className="flex items-center gap-2">
          {models.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1"
            >
              {models.map(model => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          )}
          
          <button
            onClick={closePopup}
            className="text-gray-400 hover:text-gray-600 p-1"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Context Display */}
      {context && showContext && (
        <div className="p-3 bg-blue-50 border-b border-blue-200">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-sm font-medium text-blue-800 truncate">
                  {context.title || 'Captured Context'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {messages.length > 0 && (
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.map((message, index) => (
            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                message.role === 'user' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-white border border-gray-200 text-gray-800'
              }`}>
                <div className="whitespace-pre-wrap break-words text-sm">
                  {message.content}
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-current opacity-75 animate-pulse ml-1"></span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div ref={messagesEndRef} />
      

      {/* Input */}
      <div className="p-3 bg-white border-t border-gray-200 w-full h-[50px]">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type your message... (Enter to send, Esc to close)"
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={3}
            disabled={loading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {loading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              'Send'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PopupPage; 