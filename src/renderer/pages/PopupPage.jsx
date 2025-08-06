import React, { useState, useEffect, useRef } from 'react';
import { ImagePlus, Hammer, X, FileText, Send, NotebookPen, ChevronDown, Check } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { cn } from '../lib/utils';
import MessageList from '../components/MessageList';
import { useChat } from '../context/ChatContext';

const ContextPill = ({ title, onRemove }) => (
  <Badge variant="outline" className="inline-flex items-center gap-2 bg-background/50 backdrop-blur-sm border-border/50 text-foreground shadow-sm">
    <FileText size={12} className="text-muted-foreground" />
    <span className="text-xs font-medium text-foreground">{title.slice(0, 30)}</span>
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

const CustomModelSelector = ({ selectedModel, models, onModelChange, isCompact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const getDisplayName = (model) => {
    if (isCompact) {
      // For compact view, show a shortened version
      const parts = model.split('/');
      return parts[parts.length - 1].split('-').slice(0, 2).join('-');
    }
    return model;
  };

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "text-xs border-border/50 bg-background/50 hover:bg-background/70 justify-between",
          isCompact ? "h-5 w-32 px-2" : "h-6 w-36"
        )}
      >
        <span className="truncate">{getDisplayName(selectedModel)}</span>
        <ChevronDown size={12} className="ml-1 shrink-0" />
      </Button>
      
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
            style={{ WebkitAppRegion: 'no-drag' }}
          />
          
          {/* Dropdown */}
          <div className={cn(
            "absolute z-50 mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto",
            isCompact ? "w-64 right-0" : "w-64 left-0"
          )}>
            {models.map((model) => (
              <button
                key={model}
                onClick={() => {
                  onModelChange(model);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
              >
                <span className="truncate">{model}</span>
                {selectedModel === model && <Check size={12} className="ml-2 shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const PopupPage = () => {
  const { 
    messages, 
    setMessages, 
    saveCurrentConversation,
    startNewConversation 
  } = useChat();
  
  const [context, setContext] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama-3.3-70b-versatile');
  const [models, setModels] = useState([]);
  const [showContext, setShowContext] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [files, setFiles] = useState([]);
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [visionSupported, setVisionSupported] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const popupRef = useRef(null);

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
      textarea.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [inputValue]);

  // Auto-save conversation when messages change
  useEffect(() => {
    // Only auto-save if we have messages and are not currently loading
    if (messages.length > 0 && !loading && selectedModel) {
      const saveTimeout = setTimeout(() => {
        saveCurrentConversation({ model: selectedModel });
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(saveTimeout);
    }
  }, [messages, loading, selectedModel, saveCurrentConversation]);

  // Dynamic popup resizing
  useEffect(() => {
    const popupElement = popupRef.current;
    if (!popupElement) return;

    const resizePopup = () => {
      if (popupRef.current) {
        const newHeight = popupRef.current.scrollHeight;
        const maxHeight = window.screen.availHeight * 0.85; // Cap at 85% of screen height
        
        let clampedHeight = Math.min(newHeight, maxHeight);
        clampedHeight = Math.max(clampedHeight, 100); // Min height

        window.electron.resizePopup(500, Math.ceil(clampedHeight), isExpanded);
      }
    };

    // Use MutationObserver to detect content changes that affect height
    const observer = new MutationObserver(resizePopup);
    observer.observe(popupElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Initial resize
    resizePopup();

    return () => {
      observer.disconnect();
    };
  }, [isExpanded]);

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

  const handleModelChange = async (newModel) => {
    setSelectedModel(newModel);
    
    try {
      // Update vision support based on the new model
      const modelConfigs = await window.electron.getModelConfigs();
      const modelInfo = modelConfigs[newModel];
      setVisionSupported(modelInfo?.vision_supported || false);
      
      // Clear any uploaded files if the new model doesn't support vision
      if (!(modelInfo?.vision_supported || false)) {
        setFiles([]);
      }
    } catch (error) {
      console.error('Error updating model:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const closePopup = () => {
    window.close();
  };

  const handleKeyPress = (e) => {
    // Accept suggestion on Tab (only if autocomplete is enabled)
    if (e.key === 'Tab' && autocompleteEnabled && suggestion) {
      e.preventDefault();
      setInputValue(inputValue + suggestion);
      setSuggestion('');
      return; // Prevent other key handlers from firing
    }

    // Clear suggestion on escape, but only if there's a suggestion
    if (e.key === 'Escape' && suggestion) {
      e.preventDefault();
      setSuggestion('');
      return;
    }

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

    // Create message for UI (should match the model format for consistency)
    const userMessageForUi = {
      role: 'user',
      content: modelMessageContent, // Use model format for consistency with storage
    };

    setMessages(prev => [...prev, userMessageForUi]);
    setInputValue('');
    setFiles([]); // Clear files after sending
    setSuggestion(''); // Clear suggestion on send
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
    <div 
      ref={popupRef} 
      className="flex flex-col bg-neutral-50 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-300 scrollbar-none" 
      style={{ WebkitAppRegion: 'drag' }}
    >
      
      {/* Exit Button - Always in top right */}
      {!isExpanded && (
        <div className="absolute top-3 right-3 z-50" style={{ WebkitAppRegion: 'no-drag' }}>
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
          <div className="px-4 pt-3 pb-2 flex justify-between items-center border-b border-border/30 sticky top-0 z-50 bg-background/95 backdrop-blur-sm" style={{ WebkitAppRegion: 'drag' }}>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs font-medium text-foreground">Groq Chat</span>
              </div>
              {/* Model Selector */}
              <div style={{ WebkitAppRegion: 'no-drag' }}>
                <CustomModelSelector 
                  selectedModel={selectedModel}
                  models={models}
                  onModelChange={handleModelChange}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" 
              style={{ WebkitAppRegion: 'no-drag' }}
              onClick={() => {
              startNewConversation();
              setIsExpanded(false);
            }}>
              <NotebookPen size={14} />
            </Button>
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
          </div>

          {/* Messages */}
          <div className="p-4 space-y-4 rounded-t-3xl overflow-y-auto" style={{ WebkitAppRegion: 'no-drag' }}>
            <MessageList 
              messages={messages} 
            />
          </div>
        </>
      )}

      {/* Input Area */}
      <div className={cn("bg-white backdrop-blur-sm border-t border-border/30 rounded-b-3xl sticky bottom-0", {
        "flex-1 flex items-center rounded-3xl": !isExpanded,
      })}>
        <div className="p-4 w-full space-y-3">
          {/* Header with Logo and Model Selector - Always visible */}
          <div className="flex items-center justify-between h-4 mb-2">
            <div className="flex items-center gap-2">
              <img 
                src="./groqLogo.png" 
                alt="Groq Logo" 
                className="h-4 w-auto"
              />
            </div>
          </div>

          {/* Context Pill */}
          {context && showContext && (
            <div className="flex mb-2 justify-between" style={{ WebkitAppRegion: 'no-drag' }}>
              <ContextPill 
                title={context.title || 'Captured Context'} 
                onRemove={() => setShowContext(false)}
              />
              {/* Compact Model Selector - Always visible when not expanded */}
            {!isExpanded && (
              <div style={{ WebkitAppRegion: 'no-drag' }}>
                <CustomModelSelector 
                  selectedModel={selectedModel}
                  models={models}
                  onModelChange={handleModelChange}
                  isCompact={true}
                />
              </div>
            )}
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
          <div className="flex items-end gap-1 w-full">
            {files.length < 5 && (
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "h-9 w-9 shrink-0 rounded-xl transition-all mb-1 duration-200 hover:scale-105",
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

            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask anything..."
                className="min-h-[44px] max-h-[200px] resize-none border-border/50 bg-background/80 backdrop-blur-sm focus:none pt-[10px] pr-12 rounded-2xl transition-all duration-200 text-foreground placeholder:text-muted-foreground"
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