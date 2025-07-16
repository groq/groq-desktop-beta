import React, { useState, useEffect } from 'react';
import Message from './Message';
import MarkdownRenderer from './MarkdownRenderer';

// Define types for message content
interface MessageTextContent {
  type: 'text';
  text: string;
}

interface MessageImageContent {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

type MessageContent = MessageTextContent | MessageImageContent;

// Define the message structure
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string | MessageContent[];
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  reasoning?: string;
  isStreaming?: boolean;
}

interface MessageListProps {
  messages: ChatMessage[];
  onToolCallExecute?: (toolCall: any) => void;
  onRemoveLastMessage?: () => void;
}

const MessageList: React.FC<MessageListProps> = ({ 
  messages = [], 
  onToolCallExecute, 
  onRemoveLastMessage 
}) => {
  const [showRemoveButtonIndex, setShowRemoveButtonIndex] = useState<number | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

  // Effect to handle Escape key for closing fullscreen image
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFullScreenImage(null);
      }
    };

    // Only add listener if image is fullscreen
    if (fullScreenImage) {
      document.addEventListener('keydown', handleKeyDown);
    }

    // Cleanup function to remove listener
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fullScreenImage]); // Dependency array includes fullScreenImage

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12 animate-fade-in">
        <div className="w-16 h-16 mb-6 rounded-full bg-gray-800 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </div>
        <h3 className="text-xl font-medium mb-2 text-white">Welcome to Groq Desktop</h3>
        <p className="text-center max-w-md mb-6">
          Send a message to start a conversation with your selected Groq model
        </p>
        <div className="text-sm text-gray-500 bg-gray-800 p-3 rounded-lg">
          <span className="block">Try asking about:</span>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Explaining complex topics</li>
            <li>Help with coding or debugging</li>
            <li>Creative writing or brainstorming</li>
          </ul>
        </div>
      </div>
    );
  }

  // We still filter tool messages here because the `Message` component handles displaying
  // assistant messages and their corresponding tool calls/results.
  const displayMessages = messages.filter(message => message.role !== 'tool');

  return (
    <div className="space-y-2">
      {displayMessages.map((message, index) => (
        <Message 
          key={index} 
          message={message} 
          onToolCallExecute={onToolCallExecute}
          allMessages={messages} // Pass all messages for the Message component to find tool results
          isLastMessage={index === displayMessages.length - 1}
          onRemoveMessage={index === displayMessages.length - 1 && onRemoveLastMessage ? onRemoveLastMessage : undefined}
        >
          {message.role === 'user' ? (
            <div 
              className="flex items-start gap-2"
              onMouseEnter={() => index === displayMessages.length - 1 && onRemoveLastMessage && setShowRemoveButtonIndex(index)}
              onMouseLeave={() => setShowRemoveButtonIndex(null)}
            >
              {/* Check if content is an array (structured) or string (simple text) */}
              {Array.isArray(message.content) ? (
                message.content.map((part, partIndex) => {
                  if (part.type === 'text') {
                    // Render text part using MarkdownRenderer
                    return <MarkdownRenderer key={`text-${partIndex}`} content={part.text || ''} />;
                  } else if (part.type === 'image_url' && part.image_url?.url) {
                    // Render image preview
                    return (
                      <img
                        key={`image-${partIndex}`}
                        src={part.image_url.url} // Assumes base64 data URL
                        alt={`Uploaded image ${partIndex + 1}`}
                        className="max-w-xs max-h-48 rounded-lg cursor-pointer border border-gray-700 shadow-sm transition-transform hover:scale-[1.02]" 
                        onClick={() => setFullScreenImage(part.image_url.url)} // Show fullscreen on click
                      />
                    );
                  }
                  return null; // Should not happen with current structure
                })
              ) : (
                // If content is just a string, render it directly with MarkdownRenderer
                <MarkdownRenderer content={typeof message.content === 'string' ? message.content : ''} />
              )}
            </div>
          ) : message.role === 'assistant' ? (
            <MarkdownRenderer content={typeof message.content === 'string' ? message.content : ''} />
          ) : null}
        </Message>
      ))}

      {/* Fullscreen Image Overlay */}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 cursor-pointer animate-fade-in"
          onClick={() => setFullScreenImage(null)} // Dismiss on click outside image
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img 
              src={fullScreenImage} 
              alt="Fullscreen view" 
              className="max-w-full max-h-full object-contain rounded-lg shadow-xl" 
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
            />
            <button 
              className="absolute top-2 right-2 bg-gray-900 bg-opacity-70 rounded-full p-2 text-white hover:bg-opacity-100 transition-colors" 
              onClick={() => setFullScreenImage(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageList; 