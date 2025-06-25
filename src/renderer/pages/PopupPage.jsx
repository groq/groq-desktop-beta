import React, { useState, useEffect, useRef } from 'react';
import { ImagePlus, Hammer, Search, ArrowUp, Mic, X, FileText, Bot, Send } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';

const ContextPill = ({ title, onRemove }) => (
  <Badge variant="outline" className="inline-flex items-center gap-2 bg-background/50 backdrop-blur-sm border-border/50 text-foreground shadow-sm">
    <FileText size={12} className="text-muted-foreground" />
    <span className="text-xs font-medium text-foreground">{title}</span>
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={(e) => { e.stopPropagation(); onRemove(); }} 
      className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive"
    >
      <X size={10} />
    </Button>
  </Badge>
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
  const [files, setFiles] = useState([]);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [visionSupported, setVisionSupported] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

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
      textarea.style.height = `${Math.min(scrollHeight, 120)}px`;
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
        // Check if the selected model supports vision
        const modelInfo = modelConfigs[availableModels[0]];
        setVisionSupported(modelInfo?.vision_supported || false);
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

  const handleSendMessage = async () => {
    const textContent = inputValue.trim();
    const hasText = textContent.length > 0;
    const hasFiles = files.length > 0;

    if (!hasText && !hasFiles) return;

    // Expand the popup on the first message
    if (!isExpanded) {
      setIsExpanded(true);
      window.electron.resizePopup(480, 500, true); 
    }
    
    let uiMessageContent = textContent;
    let modelMessageContent;

    // Handle files and text content
    if (hasFiles) {
      // Format content as array with text and file parts
      const contentParts = [];
      
      // Add text part only if there is text
      if (hasText) {
        contentParts.push({ type: "text", text: textContent });
      }
      
      // Add image parts
      files.forEach((file) => {
        if (file.fileType === 'image') {
          contentParts.push({
            type: "image_url",
            image_url: {
              url: file.base64,
            },
          });
        }
        // Note: Non-image files would need additional handling here
      });
      
      modelMessageContent = contentParts;
      
      // For UI display, show text + file count
      if (hasText) {
        uiMessageContent = `${textContent}\n\n📎 ${files.length} file(s) attached`;
      } else {
        uiMessageContent = `📎 ${files.length} file(s) attached`;
      }
    } else {
      // Just text content
      modelMessageContent = textContent;
    }

    // If there is context that hasn't been manually added, prepend it to the message for the model.
    if (context && showContext && context.text) {
      let contextText = context.text;
      const lines = contextText.split('\n');
      const firstContentIndex = lines.findIndex(line => !line.startsWith('Context captured from'));

      if (firstContentIndex !== -1) {
        contextText = lines.slice(firstContentIndex).join('\n').trim();
      }
      
      if (contextText) {
        if (typeof modelMessageContent === 'string') {
          modelMessageContent = `<context>${contextText}</context>\n${modelMessageContent}`;
        } else if (Array.isArray(modelMessageContent)) {
          // For array content, prepend context to the first text part
          const firstTextPart = modelMessageContent.find(part => part.type === 'text');
          if (firstTextPart) {
            firstTextPart.text = `<context>${contextText}</context>\n${firstTextPart.text}`;
          } else {
            // If no text part exists, add one at the beginning
            modelMessageContent.unshift({
              type: 'text',
              text: `<context>${contextText}</context>`
            });
          }
        }
      }
      
      // Mark context as used
      setShowContext(false);
    }

    // Create message for UI
    const userMessageForUi = {
      role: 'user',
      content: uiMessageContent,
    };

    setMessages(prev => [...prev, userMessageForUi]);
    setInputValue('');
    setFiles([]); // Clear files after sending
    setLoading(true);
    
    // Create message for model
    const userMessageForModel = {
      role: 'user',
      content: modelMessageContent
    };

    try {
      // Create assistant message placeholder
      const assistantPlaceholder = {
        role: 'assistant',
        content: '',
        isStreaming: true
      };
      
      setMessages(prev => [...prev, assistantPlaceholder]);

      // Start streaming
      const streamHandler = window.electron.startChatStream([...messages, userMessageForModel], selectedModel);
      
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

  // Function to handle file selection (images and other files)
  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    const remainingSlots = 5 - files.length;

    // Check if any images are being uploaded with a non-vision model
    const hasImages = selectedFiles.some(file => file.type.startsWith("image/"));
    if (hasImages && !visionSupported) {
      alert("The selected model does not support image inputs. Please select a vision-capable model or upload text files only.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (selectedFiles.length > remainingSlots) {
      alert(
        `You can only add ${remainingSlots > 0 ? remainingSlots : "no more"} files (max 5).`,
      );
    }

    const filePromises = selectedFiles.slice(0, remainingSlots).map((file) => {
      return new Promise((resolve, reject) => {
        // Handle different file types
        if (file.type.startsWith("image/")) {
          // For images, create base64 preview
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              base64: reader.result,
              name: file.name,
              type: file.type,
              size: file.size,
              fileType: 'image',
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        } else {
          // For other files, just store file info without base64
          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            fileType: 'document',
            file: file, // Store the actual file for later processing
          });
        }
      });
    });

    Promise.all(filePromises)
      .then((newFiles) => {
        const validFiles = newFiles.filter((file) => file !== null);
        setFiles((prev) => [...prev, ...validFiles]);
        // Reset file input value to allow selecting the same file again
        if (fileInputRef.current) fileInputRef.current.value = "";
      })
      .catch((error) => {
        console.error("Error reading files:", error);
        alert("Error processing files.");
        if (fileInputRef.current) fileInputRef.current.value = "";
      });
  };

  // Function to remove a file
  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Function to format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle Escape key for closing fullscreen image
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && fullScreenImage) {
        setFullScreenImage(null);
      }
    };

    if (fullScreenImage) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullScreenImage]);

  return (
    <div className="flex flex-col h-screen bg-background backdrop-blur-xl rounded-3xl shadow-2xl animate-in fade-in-0 zoom-in-95 duration-300" style={{ WebkitAppRegion: 'drag' }}>
      
      {/* Exit Button - Always in top right */}
      {!isExpanded && (
        <div className="absolute top-3 right-3 z-10" style={{ WebkitAppRegion: 'no-drag' }}>
          <Button 
            variant="ghost" 
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg transition-all duration-200" 
            onClick={closePopup}
            title="Close"
          >
            <X size={14} />
          </Button>
        </div>
      )}
      
      {isExpanded && (
        <>
          {/* Header - Only shows when expanded */}
          <div className="px-4 pt-3 pb-2 flex justify-between items-center border-b border-border/30" style={{ WebkitAppRegion: 'drag' }}>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-xs font-medium text-foreground">Groq Chat</span>
            </div>
            <Button 
              variant="ghost"
              size="icon"
              onClick={closePopup} 
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              style={{ WebkitAppRegion: 'no-drag' }}
            >
              <X size={14} />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 rounded-t-3xl" style={{ WebkitAppRegion: 'no-drag' }}>
            {messages.map((message, index) => (
              <div key={index} className={cn('flex items-start gap-3', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                {message.role === 'assistant' && (
                  <div className="w-8 h-8 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0 border border-border/50 shadow-sm">
                    <Bot size={16} className="text-primary"/>
                  </div>
                )}
                <div className={cn('max-w-[85%] rounded-3xl px-4 py-3 shadow-lg border backdrop-blur-sm transition-all duration-200 hover:shadow-xl', {
                  'bg-primary text-primary-foreground border-primary/20 shadow-primary/20': message.role === 'user',
                  'bg-card/80 text-card-foreground border-border/50 shadow-border/10': message.role === 'assistant',
                })}>
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {message.content}
                    {message.isStreaming && (
                      <span className="inline-block w-2 h-4 bg-current opacity-75 animate-pulse ml-1 rounded-sm"></span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-foreground">
                <Search size={32} className="mb-3 opacity-50"/>
                <p className="text-sm font-medium">Ask anything to start</p>
                <p className="text-xs opacity-75 mt-1">Press Esc to close</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </>
      )}

      {/* Input Area */}
      <div className={cn("bg-gradient-to-t from-card/60 to-card/40 backdrop-blur-sm border-t border-border/30 rounded-b-3xl", {
        "flex-1 flex items-center rounded-3xl": !isExpanded,
      })}>
        <div className="p-4 w-full space-y-3">
          {/* Context Pill */}
          {context && showContext && (
            <div className="flex" style={{ WebkitAppRegion: 'no-drag' }}>
              <ContextPill 
                title={context.title || 'Captured Context'} 
                onRemove={() => setShowContext(false)}
              />
            </div>
          )}
          
          {/* File Previews */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2" style={{ WebkitAppRegion: 'no-drag' }}>
              {files.map((file, index) => (
                <div key={index} className="relative group">
                  {file.fileType === 'image' ? (
                    // Image preview
                    <div className="w-16 h-16">
                      <img
                        src={file.base64}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg cursor-pointer shadow-sm"
                        onClick={() => setFullScreenImage(file.base64)}
                      />
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md hover:scale-110"
                        aria-label={`Remove file ${index + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    // Document preview
                    <div className="w-16 h-16 bg-muted rounded-lg flex flex-col items-center justify-center p-1 shadow-sm">
                      <FileText size={20} className="text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground text-center leading-tight truncate w-full">
                        {file.name.split('.').pop()?.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md hover:scale-110"
                        aria-label={`Remove file ${index + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Input Row */}
          <div className="flex items-end gap-2 w-full">
            {files.length < 5 && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "h-9 w-9 shrink-0 rounded-xl transition-all duration-200 hover:scale-105",
                  visionSupported 
                    ? "text-muted-foreground hover:text-foreground hover:bg-accent/50" 
                    : "text-muted-foreground/50 cursor-not-allowed"
                )}
                style={{ WebkitAppRegion: 'no-drag' }}
                title={visionSupported ? "Upload image (max 5)" : "Image upload not supported by this model"}
                disabled={!visionSupported}
              >
                <ImagePlus size={18} />
              </Button>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              multiple
              style={{ display: "none" }}
              disabled={loading || files.length >= 5}
            />
            
            <Button 
              variant="ghost" 
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent/50 shrink-0 rounded-xl transition-all duration-200 hover:scale-105" 
              style={{ WebkitAppRegion: 'no-drag' }}
              title="Configure MCP servers"
            >
              <Hammer size={16} />
            </Button>

            
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask anything..."
                className="min-h-[44px] max-h-[120px] resize-none border-border/50 bg-background/80 backdrop-blur-sm focus:border-ring/50 focus:ring-ring/20 pr-12 rounded-2xl transition-all duration-200 text-foreground placeholder:text-muted-foreground"
                rows={1}
                disabled={loading}
                style={{ WebkitAppRegion: 'no-drag' }}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || loading}
                size="icon"
                className="absolute right-2 bottom-2 h-8 w-8 rounded-xl bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105"
                style={{ WebkitAppRegion: 'no-drag' }}
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Send size={14} />
                )}
              </Button>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-accent/50 shrink-0 rounded-xl transition-all duration-200 hover:scale-105" 
              style={{ WebkitAppRegion: 'no-drag' }}
              title="Voice input"
            >
              <Mic size={16} />
            </Button>
          </div>
        </div>
      </div>

      {/* Fullscreen Image Modal */}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={() => setFullScreenImage(null)}
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <img 
            src={fullScreenImage} 
            alt="Fullscreen preview" 
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setFullScreenImage(null)}
            className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70 transition-all"
            aria-label="Close fullscreen image"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};

export default PopupPage; 