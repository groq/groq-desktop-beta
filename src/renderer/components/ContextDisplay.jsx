import React from 'react';

const ContextDisplay = ({ context, onUse, onDismiss }) => {
  if (!context) return null;

  const { title, text, source } = context;

  const handleUse = () => {
    onUse(context);
  };

  const handleDismiss = () => {
    onDismiss();
  };

  return (
    <div className="context-banner bg-blue-50 border-l-4 border-blue-400 p-4 mb-4 rounded-md shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center mb-2">
            <svg 
              className="w-5 h-5 text-blue-400 mr-2" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" 
              />
            </svg>
            <span className="text-blue-800 font-medium">
              {title || 'External Context'}
            </span>
            {source && (
              <span className="text-blue-600 text-sm ml-2">
                from {source}
              </span>
            )}
          </div>
          
          <div className="text-gray-700 text-sm max-h-32 overflow-y-auto mb-3">
            <div className="whitespace-pre-wrap break-words">
              {text.length > 200 ? `${text.substring(0, 200)}...` : text}
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleUse}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
            >
              Use as Context
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
        
        <button
          onClick={handleDismiss}
          className="ml-4 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ContextDisplay; 