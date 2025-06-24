import React, { useState, useEffect } from 'react';

/**
 * Example Modal Component for Context Capture Integration
 * 
 * This demonstrates how your teammate can integrate with the context capture system.
 * When the modal opens, it automatically retrieves the most recently captured context.
 */
const ContextModal = ({ isOpen, onClose, onSubmit }) => {
  const [context, setContext] = useState(null);
  const [userInput, setUserInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Effect to get captured context when modal opens
  useEffect(() => {
    if (isOpen) {
      getCapturedContext();
      
      // Set up listener for new context captures while modal is open
      const removeListener = window.electron.onContextCaptured((newContext) => {
        console.log('New context captured while modal is open:', newContext);
        setContext(newContext);
      });

      return () => {
        if (removeListener) removeListener();
      };
    }
  }, [isOpen]);

  // Function to retrieve captured context
  const getCapturedContext = async () => {
    try {
      setLoading(true);
      const capturedContext = await window.electron.getCapturedContext();
      
      if (capturedContext) {
        console.log('Retrieved captured context:', capturedContext);
        setContext(capturedContext);
      } else {
        console.log('No captured context available');
        setContext(null);
      }
    } catch (error) {
      console.error('Error getting captured context:', error);
      setContext(null);
    } finally {
      setLoading(false);
    }
  };

  // Function to manually trigger context capture
  const triggerCapture = async () => {
    try {
      setLoading(true);
      const newContext = await window.electron.triggerContextCapture();
      if (newContext) {
        setContext(newContext);
      }
    } catch (error) {
      console.error('Error triggering context capture:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to handle form submission
  const handleSubmit = () => {
    const submissionData = {
      context: context,
      userInput: userInput,
      timestamp: Date.now()
    };
    
    if (onSubmit) {
      onSubmit(submissionData);
    }
    
    // Clear context after use
    window.electron.clearCapturedContext();
    onClose();
  };

  // Function to clear current context
  const clearContext = () => {
    setContext(null);
    window.electron.clearCapturedContext();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            Context Capture Modal
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-2 text-gray-600">Loading context...</span>
            </div>
          )}

          {/* Context Display */}
          {context ? (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium text-gray-800">
                  Captured Context
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={triggerCapture}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Recapture
                  </button>
                  <button
                    onClick={clearContext}
                    className="px-3 py-1 text-sm bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-600">
                    Source:
                  </span>
                  <span className="text-sm text-gray-800">
                    {context.source}
                  </span>
                  {context.contextType && (
                    <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                      {context.contextType.replace('_', ' ')}
                    </span>
                  )}
                </div>

                {context.title && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-medium text-gray-600">
                      Title:
                    </span>
                    <span className="text-sm text-gray-800">
                      {context.title}
                    </span>
                  </div>
                )}

                <div className="bg-white rounded border p-3 max-h-40 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                    {context.text}
                  </pre>
                </div>

                <div className="mt-2 text-xs text-gray-500">
                  Captured: {new Date(context.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                <div className="text-gray-500 mb-4">
                  <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">No context captured</p>
                  <p className="text-xs mt-1">
                    Use Cmd+G (Mac) or Ctrl+G (Windows/Linux) to capture context
                  </p>
                </div>
                <button
                  onClick={triggerCapture}
                  className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  disabled={loading}
                >
                  Capture Context Now
                </button>
              </div>
            </div>
          )}

          {/* User Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Instructions (Optional)
            </label>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Enter any additional context or instructions..."
              className="w-full h-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Debug Info */}
          {context && (
            <details className="mb-4">
              <summary className="text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                Debug Info
              </summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                {JSON.stringify(context, null, 2)}
              </pre>
            </details>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-200 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!context && !userInput.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Submit to Groq
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContextModal;

/**
 * Usage Example:
 * 
 * import ContextModal from './components/ContextModal';
 * 
 * function App() {
 *   const [isModalOpen, setIsModalOpen] = useState(false);
 * 
 *   const handleSubmit = (data) => {
 *     console.log('Submitted data:', data);
 *     // Send to chat or handle as needed
 *     // data.context contains the captured context
 *     // data.userInput contains additional user input
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={() => setIsModalOpen(true)}>
 *         Open Context Modal
 *       </button>
 *       
 *       <ContextModal
 *         isOpen={isModalOpen}
 *         onClose={() => setIsModalOpen(false)}
 *         onSubmit={handleSubmit}
 *       />
 *     </div>
 *   );
 * }
 */ 