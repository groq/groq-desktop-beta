import React, { useState, useEffect } from 'react';
import Message from './Message';
import MarkdownRenderer from './MarkdownRenderer';

function MessageList({ messages = [], onToolCallExecute, onRemoveLastMessage }) {
  const [showRemoveButtonIndex, setShowRemoveButtonIndex] = useState(null);
  const [fullScreenImage, setFullScreenImage] = useState(null);

  // Effect to handle Escape key for closing fullscreen image
  useEffect(() => {
    const handleKeyDown = (event) => {
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
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <p className="text-center max-w-md">
          Send a message to start a conversation with Groq
        </p>
      </div>
    );
  }

  // We still filter tool messages here because the `Message` component handles displaying
  // assistant messages and their corresponding tool calls/results.
  const displayMessages = messages.filter(message => message.role !== 'tool');

  return (
    <div className="space-y-2 pt-4 p-4">
      {displayMessages.map((message, index) => (
        <Message 
          key={index} 
          message={message} 
          onToolCallExecute={onToolCallExecute}
          allMessages={messages} // Pass all messages for the Message component to find tool results
          isLastMessage={index === displayMessages.length - 1}
          onRemoveMessage={index === displayMessages.length - 1 ? onRemoveLastMessage : null}
        >
          {message.role === 'user' ? (
            <div 
              className="flex items-start gap-2"
              onMouseEnter={() => index === displayMessages.length - 1 && onRemoveLastMessage && setShowRemoveButtonIndex(index)}
              onMouseLeave={() => setShowRemoveButtonIndex(null)}
            >
              <div className="flex-1 flex flex-col gap-2"> {/* Use flex-col for text/images */}
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
                          className="max-w-xs max-h-48 rounded-md cursor-pointer self-start" // Align images left
                          onClick={() => setFullScreenImage(part.image_url.url)} // Show fullscreen on click
                        />
                      );
                    }
                    return null; // Should not happen with current structure
                  })
                ) : (
                  // If content is just a string, render it directly with MarkdownRenderer
                  <MarkdownRenderer content={message.content || ''} />
                )}
              </div>
            </div>
          ) : message.role === 'assistant' ? (
            <MarkdownRenderer content={message.content || ''} />
          ) : null}
        </Message>
      ))}

      {/* Fullscreen Image Overlay */}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 cursor-pointer"
          onClick={() => setFullScreenImage(null)} // Dismiss on click outside image
        >
          <img 
            src={fullScreenImage} 
            alt="Fullscreen view" 
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking the image itself
          />
        </div>
      )}
    </div>
  );
}

export default MessageList; 