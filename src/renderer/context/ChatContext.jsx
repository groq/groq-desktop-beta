import React, { createContext, useState, useContext, useCallback, useRef } from 'react';

// Create the context
export const ChatContext = createContext();

// Create a provider component
export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const [conversationMetadata, setConversationMetadata] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false);
  const [lastError, setLastError] = useState(null);
  const refreshTimeoutRef = useRef(null);
  const isRefreshingRef = useRef(false);

  // Helper function to validate and deduplicate conversations
  const validateAndDeduplicateConversations = useCallback((conversations) => {
    const seen = new Set();
    const validConversations = [];
    
    for (const conv of conversations) {
      // Validate required fields
      if (!conv.id || !conv.title) {
        console.warn('Invalid conversation detected, skipping:', conv);
        continue;
      }
      
      // Check for duplicates
      if (seen.has(conv.id)) {
        console.warn('Duplicate conversation ID detected, skipping:', conv.id);
        continue;
      }
      
      seen.add(conv.id);
      validConversations.push(conv);
    }
    
    if (validConversations.length !== conversations.length) {
      console.log(`Filtered conversations: ${conversations.length} -> ${validConversations.length}`);
    }
    
    return validConversations;
  }, []);

  // Function to refresh conversations list with debouncing (moved up to be defined before dependent functions)
  const refreshConversationsList = useCallback(async (limit = 50, immediate = false) => {
    // Clear existing timeout if setting a new one
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }

    const doRefresh = async () => {
      // Check if already refreshing using ref to avoid race conditions
      if (isRefreshingRef.current) {
        console.log('Refresh already in progress, skipping');
        return { success: false, error: 'Refresh already in progress' };
      }

      try {
        isRefreshingRef.current = true;
        setIsRefreshingConversations(true);
        setLastError(null); // Clear previous errors
        
        const result = await window.electron.listConversations(limit);
        
        if (result.success) {
          // Simple approach: always update with fresh data to avoid React conflicts
          const validatedConversations = validateAndDeduplicateConversations(result.conversations);
          setConversations(validatedConversations);
          console.log('Conversations list refreshed');
        } else {
          console.error('Failed to refresh conversations:', result.error);
          setLastError(result.error || 'Failed to load conversations');
        }
        
        return result;
      } catch (error) {
        console.error('Error refreshing conversations list:', error);
        const errorMessage = error.message || 'Unable to connect to conversation storage';
        setLastError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        isRefreshingRef.current = false;
        setIsRefreshingConversations(false);
      }
    };

    if (immediate) {
      return await doRefresh();
    } else {
      // Debounce with 300ms delay for non-immediate calls
      return new Promise((resolve) => {
        refreshTimeoutRef.current = setTimeout(async () => {
          const result = await doRefresh();
          resolve(result);
        }, 300);
      });
    }
  }, []); // Remove isRefreshingConversations from dependencies to avoid recreation

  // Function to start a new conversation
  const startNewConversation = useCallback(() => {
    setMessages([]);
    setCurrentConversationId(null);
    setConversationMetadata(null);
  }, []);

  // Function to save current conversation
  const saveCurrentConversation = useCallback(async (options = {}) => {
    const wasNewConversation = currentConversationId === null;
    
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
          createdAt: conversationMetadata?.createdAt,
          // Preserve existing title for existing conversations, allow regeneration for new ones
          title: wasNewConversation ? options.title : (options.title || conversationMetadata?.title)
        }
      );

      if (result.success) {
        setCurrentConversationId(result.conversationId);
        setConversationMetadata(result.metadata);
        
        // Only refresh for new conversations, update locally for existing ones
        if (wasNewConversation) {
          await refreshConversationsList(50, true); // Immediate for new conversations
        } else {
          // For existing conversations, update metadata locally to avoid refresh
          setConversations(prevConversations => 
            prevConversations.map(conv => 
              conv.id === result.conversationId 
                ? { ...conv, ...result.metadata }
                : conv
            )
          );
        }
        
        console.log(`Conversation ${result.conversationId} saved successfully`);
      }

      // Return enhanced result with wasNewConversation flag for callers
      return { ...result, wasNewConversation };
    } catch (error) {
      console.error('Error saving conversation:', error);
      // Enhanced error recovery - try to maintain consistency
      if (wasNewConversation) {
        console.warn('New conversation save failed, clearing current conversation state');
        setCurrentConversationId(null);
        setConversationMetadata(null);
      }
      return { success: false, error: error.message || 'Failed to save conversation' };
    }
  }, [messages, currentConversationId, conversationMetadata, refreshConversationsList]);

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
      // Enhanced error recovery for load failures
      setCurrentConversationId(null);
      setConversationMetadata(null);
      setMessages([]);
      return { success: false, error: error.message || 'Failed to load conversation' };
    } finally {
      setIsLoadingConversation(false);
    }
  }, []);

  // Function to delete a conversation
  const deleteConversation = useCallback(async (conversationId) => {
    try {
      // Immediately remove from local state to provide instant feedback
      setConversations(prevConversations => 
        prevConversations.filter(conv => conv.id !== conversationId)
      );
      
      const result = await window.electron.deleteConversation(conversationId);
      
      if (result.success) {
        // If we deleted the current conversation, start a new one
        if (conversationId === currentConversationId) {
          startNewConversation();
        }
        
        // Force immediate refresh to ensure consistency with backend
        await refreshConversationsList(50, true);
        console.log(`Conversation ${conversationId} deleted successfully`);
      } else {
        // If delete failed, restore the conversation in local state
        console.error('Delete failed, refreshing to restore state:', result.error);
        await refreshConversationsList(50, true);
      }
      
      return result;
    } catch (error) {
      console.error('Error deleting conversation:', error);
      // Refresh to restore correct state if there was an error
      await refreshConversationsList(50, true);
      return { success: false, error: error.message };
    }
  }, [currentConversationId, startNewConversation, refreshConversationsList]);

  // Function to update conversation metadata (e.g., title)
  const updateConversationTitle = useCallback(async (conversationId, newTitle) => {
    try {
      const result = await window.electron.updateConversationMetadata(conversationId, { title: newTitle });
      
      if (result.success) {
        // Update local metadata if this is the current conversation
        if (conversationId === currentConversationId) {
          setConversationMetadata(result.metadata);
        }
        
        // Update conversation title locally to avoid refresh
        setConversations(prevConversations => 
          prevConversations.map(conv => 
            conv.id === conversationId 
              ? { ...conv, ...result.metadata }
              : conv
          )
        );
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
    isRefreshingConversations,
    lastError,
    
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