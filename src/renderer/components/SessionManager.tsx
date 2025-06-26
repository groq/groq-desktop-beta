import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import Button from './atoms/Button/Button';

interface SessionManagerProps {
  className?: string;
}

const SessionManager: React.FC<SessionManagerProps> = ({ className = '' }) => {
  const { 
    activeSessionId, 
    sessions, 
    createNewSession, 
    switchSession, 
    deleteSession, 
    clearMessages,
    isLoading
  } = useChat();
  
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  
  // Format the session name for display
  const formatSessionName = (sessionId: string) => {
    if (sessionId === 'default') {
      return 'Default Session';
    }
    
    // Extract timestamp from session_{timestamp} and format as date
    const timestamp = sessionId.split('_')[1];
    if (timestamp) {
      const date = new Date(parseInt(timestamp));
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    return sessionId;
  };
  
  // Get the message count for a session
  const getMessageCount = (sessionId: string) => {
    return sessions[sessionId]?.length || 0;
  };
  
  const handleDelete = (sessionId: string) => {
    if (showConfirmDelete === sessionId) {
      deleteSession(sessionId);
      setShowConfirmDelete(null);
    } else {
      setShowConfirmDelete(sessionId);
    }
  };
  
  const handleClear = () => {
    if (showConfirmClear) {
      clearMessages();
      setShowConfirmClear(false);
    } else {
      setShowConfirmClear(true);
    }
  };
  
  return (
    <div className={`session-manager ${className}`}>
      <div className="p-3 bg-gray-800 rounded-lg mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-medium text-white">Chat Sessions</h3>
          <Button
            variant="primary"
            size="small"
            onClick={createNewSession}
            disabled={isLoading}
          >
            New Session
          </Button>
        </div>
        
        <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
          {Object.keys(sessions).map(sessionId => (
            <div 
              key={sessionId}
              className={`
                p-3 rounded cursor-pointer flex justify-between items-center
                ${activeSessionId === sessionId ? 'bg-primary bg-opacity-20 border border-primary' : 'bg-gray-700 hover:bg-gray-600'}
              `}
              onClick={() => activeSessionId !== sessionId && switchSession(sessionId)}
            >
              <div className="flex flex-col">
                <span className="font-medium">{formatSessionName(sessionId)}</span>
                <span className="text-xs text-gray-400">{getMessageCount(sessionId)} messages</span>
              </div>
              <div className="flex gap-2">
                {showConfirmDelete === sessionId ? (
                  <>
                    <Button
                      variant="danger"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(sessionId);
                      }}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowConfirmDelete(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(sessionId);
                    }}
                    disabled={sessionId === 'default' || isLoading}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {activeSessionId && (
          <div className="mt-4 pt-3 border-t border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-400">Current session: {formatSessionName(activeSessionId)}</span>
              {showConfirmClear ? (
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    size="small"
                    onClick={handleClear}
                  >
                    Clear All
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => setShowConfirmClear(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setShowConfirmClear(true)}
                  disabled={getMessageCount(activeSessionId) === 0 || isLoading}
                >
                  Clear Messages
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionManager; 