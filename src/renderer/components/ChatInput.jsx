import React, { useState, useRef, useEffect } from 'react';

function ChatInput({ onSendMessage, loading = false, visionSupported = false }) {
  const [message, setMessage] = useState('');
  const [images, setImages] = useState([]); // State for selected images
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null); // Ref for file input
  const prevLoadingRef = useRef(loading);

  // Function to handle image selection
  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    const remainingSlots = 5 - images.length;

    if (files.length > remainingSlots) {
      alert(`You can only add ${remainingSlots > 0 ? remainingSlots : 'no more'} images (max 5).`);
      // Optionally, only take the allowed number of files
      // files = files.slice(0, remainingSlots);
    }

    const imagePromises = files.slice(0, remainingSlots).map(file => {
      return new Promise((resolve, reject) => {
        // Basic validation (optional: check file type, size)
        if (!file.type.startsWith('image/')) {
          console.warn(`Skipping non-image file: ${file.name}`);
          return resolve(null); // Resolve with null to filter out later
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          // Store base64 string and file name/type for display
          resolve({ 
            base64: reader.result, // Includes data:image/jpeg;base64,... prefix
            name: file.name,
            type: file.type 
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    });

    Promise.all(imagePromises)
      .then(newImages => {
        const validImages = newImages.filter(img => img !== null);
        setImages(prev => [...prev, ...validImages]);
        // Reset file input value to allow selecting the same file again
        if (fileInputRef.current) fileInputRef.current.value = '';
      })
      .catch(error => {
        console.error("Error reading image files:", error);
        alert("Error processing images.");
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  // Function to remove an image
  const removeImage = (index) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

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

  // Focus the textarea when loading changes from true to false (completion finished)
  useEffect(() => {
    // Check if loading just changed from true to false
    if (prevLoadingRef.current && !loading) {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
    // Update the ref with current loading state
    prevLoadingRef.current = loading;
  }, [loading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const textContent = message.trim();
    const hasText = textContent.length > 0;
    const hasImages = images.length > 0;

    if ((hasText || hasImages) && !loading) {
      let contentToSend;
      if (hasImages) {
        // Format content as array with text and image parts
        contentToSend = [
          // Add text part only if there is text
          ...(hasText ? [{ type: 'text', text: textContent }] : []),
          // Add image parts
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: img.base64 } // Send base64 data URL
          }))
        ];
      } else {
        // If no images, send only the text string
        contentToSend = [{ type: 'text', text: textContent }]; // Send as array even for text only
      }

      onSendMessage(contentToSend);
      setMessage('');
      setImages([]); // Clear images after sending
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {/* Image Previews Area */}
      {images.length > 0 && (
        <div className="flex flex-col gap-2 mb-2">
          <p className="text-sm font-medium text-gray-400">Attached Images ({images.length}):</p>
          <div className="flex flex-wrap gap-2 p-2 border border-gray-600 rounded-md">
            {images.map((img, index) => (
              <div key={index} className="relative group w-16 h-16">
                <img 
                  src={img.base64} 
                  alt={`Preview ${index + 1}`} 
                  className="w-full h-full object-cover rounded-md cursor-pointer"
                  // Add onClick for larger preview later if needed
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove image ${index + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2">
        {/* Image Upload Button - Only show if vision is supported and fewer than 5 images */}
        {visionSupported && images.length < 5 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()} // Trigger file input
            // Use the tools-button class like the gear icon
            className="tools-button" 
            title="Add Image (max 5)"
            disabled={loading}
          >
            {/* Simple Paperclip Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
          </button>
        )}
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageChange}
          accept="image/*" // Accept only image files
          multiple // Allow multiple file selection
          style={{ display: 'none' }} // Hide the actual input
          disabled={loading || images.length >= 5}
        />

        {/* Text Area */}
        <div className="flex-1 flex">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for newline)"
            className="w-full block py-2 px-3 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-white placeholder-gray-400 resize-none overflow-hidden max-h-[200px]"
            rows={1}
            disabled={loading}
          />
        </div>
        {/* Send Button */}
        <button
          type="submit"
          className="py-2 px-4 bg-primary hover:bg-primary/90 text-white rounded transition-colors self-end" // Align button to bottom
          disabled={loading || (!message.trim() && images.length === 0)} // Disable if no text and no images
        >
          {loading ? (
            <span>Sending...</span>
          ) : (
            <span>Send</span>
          )}
        </button>
      </div>
    </form>
  );
}

export default ChatInput; 