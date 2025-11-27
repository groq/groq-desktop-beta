import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';

// Create the context
export const ChatContext = createContext();

// Create a provider component
export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatList, setChatList] = useState([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  
  // Use a ref to track current chat ID for immediate access (state updates are async)
  const currentChatIdRef = useRef(null);
  
  // Track if we need to generate a title after first user message
  const needsTitleGeneration = useRef(false);
  const titleGenerationInProgress = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  // Load chat list on mount
  useEffect(() => {
    loadChatList();
  }, []);

  // Load the list of chats
  const loadChatList = useCallback(async () => {
    try {
      setIsLoadingChats(true);
      const chats = await window.electron.chatHistory.list();
      setChatList(chats || []);
    } catch (error) {
      console.error('Error loading chat list:', error);
      setChatList([]);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  // Generate and update chat title
  const generateAndUpdateTitle = useCallback(async (chatId, userMessage) => {
    if (!chatId || titleGenerationInProgress.current) return;
    
    titleGenerationInProgress.current = true;
    console.log('[ChatContext] Generating title for chat:', chatId);
    
    try {
      // Extract text content if structured message
      let textContent = userMessage;
      if (Array.isArray(userMessage)) {
        textContent = userMessage
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(' ');
      }
      
      const title = await window.electron.chatHistory.generateTitle(textContent);
      console.log('[ChatContext] Generated title:', title);
      
      if (title && title !== 'New Chat') {
        await window.electron.chatHistory.updateTitle(chatId, title);
        // Refresh chat list to show new title
        await loadChatList();
      }
    } catch (error) {
      console.error('Error generating chat title:', error);
    } finally {
      titleGenerationInProgress.current = false;
      needsTitleGeneration.current = false;
    }
  }, [loadChatList]);

  // Create a new chat
  const createNewChat = useCallback(async (model, useResponsesApi = false) => {
    try {
      const chat = await window.electron.chatHistory.create(model, useResponsesApi);
      if (chat) {
        // Update both state and ref immediately
        currentChatIdRef.current = chat.id;
        setCurrentChatId(chat.id);
        setMessages([]);
        needsTitleGeneration.current = true;
        // Refresh the chat list
        await loadChatList();
        console.log('[ChatContext] Created new chat:', chat.id, 'useResponsesApi:', useResponsesApi);
        return chat;
      }
    } catch (error) {
      console.error('Error creating new chat:', error);
    }
    return null;
  }, [loadChatList]);

  // Load a specific chat
  const loadChat = useCallback(async (chatId) => {
    try {
      const chat = await window.electron.chatHistory.load(chatId);
      if (chat) {
        currentChatIdRef.current = chat.id;
        setCurrentChatId(chat.id);
        setMessages(chat.messages || []);
        // Don't need title generation for existing chats
        needsTitleGeneration.current = false;
        return chat;
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    }
    return null;
  }, []);

  // Update the timestamp of a chat locally without reloading the entire list
  const updateChatTimestampLocally = useCallback((chatId) => {
    setChatList(prev => {
      const updatedList = prev.map(chat => 
        chat.id === chatId 
          ? { ...chat, updatedAt: new Date().toISOString() }
          : chat
      );
      // Re-sort by updatedAt (most recent first)
      return updatedList.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  }, []);

  // Save current chat messages
  const saveCurrentChat = useCallback(async (updatedMessages) => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
    
    try {
      await window.electron.chatHistory.updateMessages(chatId, updatedMessages || messages);
      // Update timestamp locally instead of reloading the entire list
      updateChatTimestampLocally(chatId);
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  }, [messages, updateChatTimestampLocally]);

  // Delete a chat
  const deleteChat = useCallback(async (chatId) => {
    try {
      const result = await window.electron.chatHistory.delete(chatId);
      if (result.success) {
        // If we deleted the current chat, clear the state
        if (chatId === currentChatIdRef.current) {
          currentChatIdRef.current = null;
          setCurrentChatId(null);
          setMessages([]);
        }
        // Refresh chat list
        await loadChatList();
        return true;
      }
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
    return false;
  }, [loadChatList]);

  // Start a fresh chat (clear current without creating new)
  const startFreshChat = useCallback(() => {
    currentChatIdRef.current = null;
    setCurrentChatId(null);
    setMessages([]);
    needsTitleGeneration.current = false;
  }, []);

  // Toggle sidebar collapsed state
  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  // Wrapper for setMessages that also handles saving and title generation
  const setMessagesWithSave = useCallback((updater) => {
    setMessages(prev => {
      const newMessages = typeof updater === 'function' ? updater(prev) : updater;
      
      // Use ref for immediate access to current chat ID
      const chatId = currentChatIdRef.current;
      
      // If we have a current chat, save the messages
      if (chatId && newMessages.length > 0) {
        // Save asynchronously without blocking
        window.electron.chatHistory.updateMessages(chatId, newMessages)
          .then(() => {
            // Update timestamp locally instead of reloading entire list
            updateChatTimestampLocally(chatId);
          })
          .catch(err => console.error('Error auto-saving chat:', err));
      }
      
      // Check if we need to generate a title (first user message added)
      if (needsTitleGeneration.current && chatId) {
        const userMessages = newMessages.filter(m => m.role === 'user');
        if (userMessages.length === 1) {
          // First user message - generate title
          console.log('[ChatContext] First user message detected, generating title...');
          generateAndUpdateTitle(chatId, userMessages[0].content);
        }
      }
      
      return newMessages;
    });
  }, [generateAndUpdateTitle, updateChatTimestampLocally]);

  // Provide the state and methods to children
  const value = {
    messages,
    setMessages: setMessagesWithSave,
    currentChatId,
    chatList,
    isLoadingChats,
    isSidebarCollapsed,
    loadChatList,
    createNewChat,
    loadChat,
    saveCurrentChat,
    deleteChat,
    startFreshChat,
    toggleSidebar,
    needsTitleGeneration,
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
