import React, { useState, useRef, useEffect, ChangeEvent, KeyboardEvent, FormEvent } from 'react';

// Define message content types
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

interface ImageData {
  base64: string;
  name: string;
  type: string;
}

interface ChatInputProps {
  onSendMessage: (content: MessageContent[]) => void;
  loading?: boolean;
  visionSupported?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  loading = false, 
  visionSupported = false 
}) => {
  const [message, setMessage] = useState<string>('');
  const [images, setImages] = useState<ImageData[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevLoadingRef = useRef<boolean>(loading);

  // Function to handle image selection
  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    
    const files = Array.from(e.target.files);
    const remainingSlots = 5 - images.length;

    if (files.length > remainingSlots) {
      alert(`You can only add ${remainingSlots > 0 ? remainingSlots : 'no more'} images (max 5).`);
    }

    const imagePromises = files.slice(0, remainingSlots).map(file => {
      return new Promise<ImageData | null>((resolve, reject) => {
        // Basic validation
        if (!file.type.startsWith('image/')) {
          console.warn(`Skipping non-image file: ${file.name}`);
          return resolve(null);
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve({ 
              base64: reader.result,
              name: file.name,
              type: file.type 
            });
          } else {
            resolve(null);
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises)
      .then(newImages => {
        const validImages = newImages.filter((img): img is ImageData => img !== null);
        setImages(prev => [...prev, ...validImages]);
        // Reset file input value
        if (fileInputRef.current) fileInputRef.current.value = '';
      })
      .catch(error => {
        console.error("Error reading image files:", error);
        alert("Error processing images.");
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  // Function to remove an image
  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [message]);

  // Focus the textarea after component mounts
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Focus the textarea when loading changes from true to false
  useEffect(() => {
    if (prevLoadingRef.current && !loading) {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
    prevLoadingRef.current = loading;
  }, [loading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const textContent = message.trim();
    const hasText = textContent.length > 0;
    const hasImages = images.length > 0;

    if ((hasText || hasImages) && !loading) {
      let contentToSend: MessageContent[] = [];
      
      if (hasImages) {
        // Format content as array with text and image parts
        if (hasText) {
          const textPart: MessageTextContent = { 
            type: 'text', 
            text: textContent 
          };
          contentToSend.push(textPart);
        }
        
        // Add image parts
        images.forEach(img => {
          const imagePart: MessageImageContent = {
            type: 'image_url',
            image_url: { url: img.base64 }
          };
          contentToSend.push(imagePart);
        });
      } else {
        // If no images, send only the text string as array
        contentToSend = [{ 
          type: 'text' as const, 
          text: textContent 
        }];
      }

      onSendMessage(contentToSend);
      setMessage('');
      setImages([]);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const isDisabled = loading || (!message.trim() && images.length === 0);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {/* Image Previews Area */}
      {images.length > 0 && (
        <div className="flex flex-col gap-2 mb-1 animate-fade-in">
          <div className="flex flex-wrap gap-3 p-3 bg-gray-800 rounded-xl shadow-inner">
            {images.map((img, index) => (
              <div key={index} className="relative group">
                <div className="w-20 h-20 overflow-hidden rounded-lg border border-gray-600 shadow-sm group-hover:border-gray-400 transition-all">
                  <img 
                    src={img.base64} 
                    alt={`Preview ${index + 1}`} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-md transition-transform hover:bg-red-600 hover:scale-110"
                  aria-label={`Remove image ${index + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start">
        <div className="flex-1 flex items-end relative rounded-2xl bg-gray-800 shadow-sm border border-gray-700 focus-within:border-primary transition-colors overflow-hidden pr-14">
          {/* Image Upload Button - Only show if vision is supported and fewer than 5 images */}
          {visionSupported && images.length < 5 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-gray-400 hover:text-white transition-colors focus:outline-none" 
              title="Add Image (max 5)"
              disabled={loading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageChange}
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            disabled={loading || images.length >= 5}
          />

          {/* Text Area */}
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Groq..."
            className="flex-1 py-3 px-4 bg-transparent text-white placeholder-gray-400 resize-none overflow-hidden max-h-[200px] border-0 focus:ring-0 focus:outline-none"
            rows={1}
            disabled={loading}
          />
          
          {/* Send Button */}
          <button
            type="submit"
            className="absolute right-0 top-1/2 -translate-y-1/2 p-3 text-white rounded-r-xl transition-all"
            disabled={isDisabled}
          >
            <div className={`p-2 rounded-full ${isDisabled ? 'text-gray-500' : 'bg-primary text-white hover:bg-primary/90'} transition-colors`}>
              {loading ? (
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </button>
        </div>
      </div>
    </form>
  );
};

export default ChatInput; 