import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { ChatMessage } from '../components/MessageList';

interface ChatContextType {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  activeSessionId: string;
  sessions: { [key: string]: ChatMessage[] };
  createNewSession: () => void;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  addMessage: (message: ChatMessage) => void;
  removeLastMessage: () => void;
  clearMessages: () => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

// Create the context with default values
const ChatContext = createContext<ChatContextType>({
  messages: [],
  setMessages: () => {},
  activeSessionId: 'default',
  sessions: {},
  createNewSession: () => {},
  switchSession: () => {},
  deleteSession: () => {},
  addMessage: () => {},
  removeLastMessage: () => {},
  clearMessages: () => {},
  isLoading: false,
  setIsLoading: () => {},
});

// Generate a unique session ID
const generateSessionId = () => `session_${Date.now()}`;

// Provider component
export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSessionId, setActiveSessionId] = useState<string>('default');
  const [sessions, setSessions] = useState<{ [key: string]: ChatMessage[] }>({
    default: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Get the active messages array for the current session
  const messages = sessions[activeSessionId] || [];
  
  // Set messages for the active session
  const setMessages = useCallback((messagesOrSetter: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setSessions(prevSessions => {
      const newMessages = typeof messagesOrSetter === 'function' 
        ? messagesOrSetter(prevSessions[activeSessionId] || [])
        : messagesOrSetter;
        
      return {
        ...prevSessions,
        [activeSessionId]: newMessages,
      };
    });
  }, [activeSessionId]);
  
  // Create a new chat session
  const createNewSession = useCallback(() => {
    const newSessionId = generateSessionId();
    setSessions(prev => ({
      ...prev,
      [newSessionId]: [],
    }));
    setActiveSessionId(newSessionId);
    return newSessionId;
  }, []);
  
  // Switch to an existing session
  const switchSession = useCallback((sessionId: string) => {
    if (sessions[sessionId]) {
      setActiveSessionId(sessionId);
    }
  }, [sessions]);
  
  // Delete a session
  const deleteSession = useCallback((sessionId: string) => {
    if (sessionId === 'default') return; // Prevent deleting the default session
    
    setSessions(prev => {
      const newSessions = { ...prev };
      delete newSessions[sessionId];
      
      // If deleting the active session, switch to default
      if (sessionId === activeSessionId) {
        setActiveSessionId('default');
      }
      
      return newSessions;
    });
  }, [activeSessionId]);
  
  // Add a new message to the active session
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, [setMessages]);
  
  // Remove the last message from the active session
  const removeLastMessage = useCallback(() => {
    setMessages(prev => prev.length > 0 ? prev.slice(0, -1) : prev);
  }, [setMessages]);
  
  // Clear all messages in the active session
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, [setMessages]);
  
  // Try to load sessions from localStorage on mount
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem('chat_sessions');
      if (savedSessions) {
        const parsedSessions = JSON.parse(savedSessions);
        setSessions(parsedSessions);
        
        const savedActiveSession = localStorage.getItem('active_session_id');
        if (savedActiveSession && parsedSessions[savedActiveSession]) {
          setActiveSessionId(savedActiveSession);
        }
      }
    } catch (error) {
      console.error('Failed to load chat sessions from localStorage:', error);
    }
  }, []);
  
  // Save sessions to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('chat_sessions', JSON.stringify(sessions));
      localStorage.setItem('active_session_id', activeSessionId);
    } catch (error) {
      console.error('Failed to save chat sessions to localStorage:', error);
    }
  }, [sessions, activeSessionId]);
  
  const value = {
    messages,
    setMessages,
    activeSessionId,
    sessions,
    createNewSession,
    switchSession,
    deleteSession,
    addMessage,
    removeLastMessage,
    clearMessages,
    isLoading,
    setIsLoading,
  };
  
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

// Custom hook for using the chat context
export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}; 