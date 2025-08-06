import React, { createContext, useState, useContext, useCallback } from 'react';

// Create the context
export const ChatContext = createContext();

// Create a provider component
export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [conversationMetadata, setConversationMetadata] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  // Function to start a new conversation
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setConversationMetadata(null);
  }, []);

  // Function to save current conversation
  const saveCurrentConversation = useCallback(async (options = {}) => {
    try {
      if (messages.length === 0) {
        console.log('No messages to save');
        return { success: false, error: 'No messages to save' };
      }

      const result = await window.electron.saveConversation(
        currentConversationId, 
        messages, 
        {
          ...options,
          model: options.model || conversationMetadata?.model,
          createdAt: conversationMetadata?.createdAt
        }
      );

      if (result.success) {
        setCurrentConversationId(result.conversationId);
        setConversationMetadata(result.metadata);
        console.log(`Conversation ${result.conversationId} saved successfully`);
      }

      return result;
    } catch (error) {
      console.error('Error saving conversation:', error);
      return { success: false, error: error.message };
    }
  }, [messages, currentConversationId, conversationMetadata]);

  // Function to load a conversation
  const loadConversation = useCallback(async (conversationId) => {
    try {
      setIsLoadingConversation(true);
      const result = await window.electron.loadConversation(conversationId);

      if (result.success) {
        setMessages(result.conversation.messages);
        setCurrentConversationId(conversationId);
        setConversationMetadata(result.conversation.metadata);
        console.log(`Conversation ${conversationId} loaded successfully`);
      }

      return result;
    } catch (error) {
      console.error('Error loading conversation:', error);
      return { success: false, error: error.message };
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  // Function to delete a conversation
  const deleteConversation = useCallback(async (conversationId) => {
    try {
      const result = await window.electron.deleteConversation(conversationId);
      
      if (result.success) {
        // If we deleted the current conversation, start a new one
        if (conversationId === currentConversationId) {
          startNewConversation();
        }
        
        // Refresh conversations list
        await refreshConversationsList();
      }
      
      return result;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      return { success: false, error: error.message };
    }
  }, [currentConversationId, startNewConversation]);

  // Function to refresh conversations list
  const refreshConversationsList = useCallback(async (limit = 50) => {
    try {
      const result = await window.electron.listConversations(limit);
      
      if (result.success) {
        setConversations(result.conversations);
      }
      
      return result;
    } catch (error) {
      console.error('Error refreshing conversations list:', error);
      return { success: false, error: error.message };
    }
  }, []);

  // Function to update conversation metadata (e.g., title)
  const updateConversationTitle = useCallback(async (conversationId, newTitle) => {
    try {
      const result = await window.electron.updateConversationMetadata(conversationId, { title: newTitle });
      
      if (result.success) {
        // Update local metadata if this is the current conversation
        if (conversationId === currentConversationId) {
          setConversationMetadata(result.metadata);
        }
        
        // Refresh conversations list to show updated title
        await refreshConversationsList();
      }
      
      return result;
    } catch (error) {
      console.error('Error updating conversation title:', error);
      return { success: false, error: error.message };
    }
  }, [currentConversationId, refreshConversationsList]);

  // Provide the state and functions to children
  const value = {
    // Message state
    messages,
    setMessages,
    
    // Conversation state
    currentConversationId,
    conversationMetadata,
    conversations,
    isLoadingConversation,
    
    // Conversation actions
    startNewConversation,
    saveCurrentConversation,
    loadConversation,
    deleteConversation,
    refreshConversationsList,
    updateConversationTitle,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

// Create a custom hook for easy context consumption
export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}; 