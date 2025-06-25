import React, { useState, useEffect, useRef } from 'react';
import { Plus, Globe, Search, ArrowUp, Mic, X, FileText, Bot } from 'lucide-react';
import clsx from 'clsx';

const ContextPill = ({ title, onRemove, onClick }) => (
  <div onClick={onClick} className="cursor-pointer bg-white border border-gray-200 rounded-full px-3 py-1 text-xs font-medium text-gray-800 flex items-center gap-2 shadow-sm hover:bg-gray-50">
    <FileText size={14} className="text-gray-500" />
    <span className="truncate max-w-xs">{title}</span>
    <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-gray-400 hover:text-gray-600">
      <X size={14} />
    </button>
  </div>
);

const PopupPage = () => {
  const [context, setContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [models, setModels] = useState([]);
  const [showContext, setShowContext] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

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
      if (textareaRef.current) {
        textareaRef.current.focus();
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

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      //-3 for border and padding
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [inputValue]);

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
      let content = context.text;
      const lines = content.split('\n');
      const firstContentIndex = lines.findIndex(line => !line.startsWith('Context captured from'));

      if (firstContentIndex !== -1) {
        content = lines.slice(firstContentIndex).join('\n');
      }
      
      setInputValue(prev => prev ? `${prev}\n${content}` : content);
      setShowContext(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Expand the popup on the first message
    if (!isExpanded) {
      setIsExpanded(true);
      // Width, height, resizable
      window.electron.resizePopup(500, 500, true); 
    }

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
    <div className="flex flex-col h-screen bg-neutral-50 text-sm font-sans overflow-hidden" style={{ WebkitAppRegion: 'drag' }}>
      
      {isExpanded && (
        <>
          {/* Header */}
          <div className="px-3 pt-3 flex justify-between items-center" style={{ WebkitAppRegion: 'drag' }}>
            <div /> {/* Placeholder to keep layout consistent */}
            <button 
              onClick={closePopup} 
              className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-md"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ WebkitAppRegion: 'no-drag' }}>
            {messages.map((message, index) => (
              <div key={index} className={clsx('flex items-start gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                {message.role === 'assistant' && (
                  <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                    <Bot size={18} className="text-gray-600"/>
                  </div>
                )}
                <div className={clsx('max-w-[85%] rounded-2xl px-4 py-2.5', {
                  'bg-blue-600 text-white': message.role === 'user',
                  'bg-white border border-gray-100 text-gray-800 shadow-sm': message.role === 'assistant',
                })}>
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.content}
                    {message.isStreaming && (
                      <span className="inline-block w-2 h-3 bg-current opacity-75 animate-pulse ml-1.5 rounded-full"></span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Search size={40} className="mb-2"/>
                <p>Ask anything to start</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </>
      )}

      {/* Input */}
      <div className={clsx("bg-white w-full", {
        "border-t border-neutral-200": isExpanded,
        "flex-1 flex items-center": !isExpanded,
      })}>
        <div className="p-3 flex flex-col gap-2 w-full">
          {context && showContext && (
            <div style={{ WebkitAppRegion: 'no-drag' }} className="mb-1">
              <ContextPill 
                title={context.title || 'Captured Context'} 
                onRemove={() => setShowContext(false)}
                onClick={useContext}
              />
            </div>
          )}
          <div className="flex items-end gap-2 w-full">
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
              <Plus size={20} />
            </button>
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
              <Globe size={18} />
            </button>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask anything..."
              className="flex-1 max-h-40 resize-none bg-transparent border-none focus:ring-0 px-2 py-1.5 text-base text-gray-800 placeholder-gray-400"
              rows={1}
              disabled={loading}
              style={{ WebkitAppRegion: 'no-drag' }}
            />
            <button className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
                <Mic size={20} />
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || loading}
              className="w-9 h-9 flex items-center justify-center bg-black text-white rounded-full disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              {loading ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <ArrowUp size={20} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PopupPage; 