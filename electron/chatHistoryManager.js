const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Groq = require('groq-sdk');

let appInstance = null;
let settingsLoader = null;

/**
 * Initialize the chat history manager with app instance and settings loader
 * @param {Electron.App} app - The Electron app instance
 * @param {Function} loadSettings - Function to load settings
 */
function initialize(app, loadSettings) {
    appInstance = app;
    settingsLoader = loadSettings;
}

/**
 * Get the directory where chat history files are stored
 * @returns {string} Path to chat history directory
 */
function getChatHistoryDir() {
    if (!appInstance) {
        throw new Error('Chat history manager not initialized');
    }
    const userDataPath = appInstance.getPath('userData');
    const chatHistoryDir = path.join(userDataPath, 'chat-history');
    
    // Ensure directory exists
    if (!fs.existsSync(chatHistoryDir)) {
        fs.mkdirSync(chatHistoryDir, { recursive: true });
    }
    
    return chatHistoryDir;
}

/**
 * Get the path for a specific chat file
 * @param {string} chatId - The chat ID
 * @returns {string} Path to the chat file
 */
function getChatFilePath(chatId) {
    return path.join(getChatHistoryDir(), `${chatId}.json`);
}

/**
 * Create a new chat with an optional initial message
 * @param {string} model - The model used for this chat
 * @param {boolean} useResponsesApi - Whether this chat uses Responses API
 * @returns {Object} The new chat object
 */
function createChat(model = 'llama-3.3-70b-versatile', useResponsesApi = false) {
    const now = new Date().toISOString();
    const chat = {
        id: crypto.randomUUID(),
        title: 'New Chat',
        createdAt: now,
        updatedAt: now,
        model: model,
        useResponsesApi: useResponsesApi,
        messages: []
    };
    
    // Save the empty chat
    saveChat(chat);
    
    return chat;
}

/**
 * Save a chat to disk
 * @param {Object} chat - The chat object to save
 */
function saveChat(chat) {
    const filePath = getChatFilePath(chat.id);
    chat.updatedAt = new Date().toISOString();
    
    // Clean messages for storage - remove streaming flags and other transient/API-specific data
    const cleanedChat = {
        ...chat,
        messages: chat.messages.map(msg => {
            const cleanMsg = { ...msg };
            // Remove transient streaming properties
            delete cleanMsg.isStreaming;
            delete cleanMsg.liveReasoning;
            delete cleanMsg.liveExecutedTools;
            delete cleanMsg.reasoningStartTime;
            // Remove API-specific properties that cause issues when switching modes
            delete cleanMsg.finish_reason;
            delete cleanMsg.pre_calculated_tool_responses;
            delete cleanMsg.mcp_approval_requests;
            return cleanMsg;
        })
    };
    
    fs.writeFileSync(filePath, JSON.stringify(cleanedChat, null, 2));
}

/**
 * Load a chat from disk
 * @param {string} chatId - The chat ID to load
 * @returns {Object|null} The chat object or null if not found
 */
function loadChat(chatId) {
    const filePath = getChatFilePath(chatId);
    
    if (!fs.existsSync(filePath)) {
        return null;
    }
    
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error loading chat ${chatId}:`, error);
        return null;
    }
}

/**
 * Delete a chat from disk
 * @param {string} chatId - The chat ID to delete
 * @returns {boolean} True if deleted successfully
 */
function deleteChat(chatId) {
    const filePath = getChatFilePath(chatId);
    
    if (!fs.existsSync(filePath)) {
        return false;
    }
    
    try {
        fs.unlinkSync(filePath);
        return true;
    } catch (error) {
        console.error(`Error deleting chat ${chatId}:`, error);
        return false;
    }
}

/**
 * Get a list of all chats (metadata only, not full messages)
 * @returns {Array} Array of chat metadata objects sorted by updatedAt descending
 */
function listChats() {
    const chatDir = getChatHistoryDir();
    const chats = [];
    
    try {
        const files = fs.readdirSync(chatDir);
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(chatDir, file);
                try {
                    const data = fs.readFileSync(filePath, 'utf8');
                    const chat = JSON.parse(data);
                    // Return only metadata, not full messages
                    chats.push({
                        id: chat.id,
                        title: chat.title,
                        createdAt: chat.createdAt,
                        updatedAt: chat.updatedAt,
                        model: chat.model,
                        messageCount: chat.messages?.length || 0,
                        useResponsesApi: chat.useResponsesApi || false
                    });
                } catch (error) {
                    console.error(`Error reading chat file ${file}:`, error);
                }
            }
        }
        
        // Sort by updatedAt descending (most recent first)
        chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } catch (error) {
        console.error('Error listing chats:', error);
    }
    
    return chats;
}

/**
 * Update a chat's messages
 * @param {string} chatId - The chat ID
 * @param {Array} messages - The messages array
 */
function updateChatMessages(chatId, messages) {
    const chat = loadChat(chatId);
    if (!chat) {
        console.error(`Chat ${chatId} not found`);
        return null;
    }
    
    chat.messages = messages;
    saveChat(chat);
    return chat;
}

/**
 * Update a chat's title
 * @param {string} chatId - The chat ID
 * @param {string} title - The new title
 */
function updateChatTitle(chatId, title) {
    const chat = loadChat(chatId);
    if (!chat) {
        console.error(`Chat ${chatId} not found`);
        return null;
    }
    
    chat.title = title;
    saveChat(chat);
    return chat;
}

/**
 * Generate a title for a chat based on the first user message
 * Uses llama-3.1-8b-instant for fast title generation
 * @param {string} userMessage - The first user message content
 * @returns {Promise<string>} Generated title
 */
async function generateChatTitle(userMessage) {
    if (!settingsLoader) {
        console.error('Settings loader not initialized');
        return 'New Chat';
    }
    
    const settings = settingsLoader();
    
    if (!settings.GROQ_API_KEY || settings.GROQ_API_KEY === '<replace me>') {
        console.warn('API key not configured, using default title');
        return 'New Chat';
    }
    
    try {
        const groq = new Groq({ apiKey: settings.GROQ_API_KEY });
        
        // Extract text content if structured message
        let textContent = userMessage;
        if (typeof userMessage !== 'string') {
            if (Array.isArray(userMessage)) {
                textContent = userMessage
                    .filter(part => part.type === 'text')
                    .map(part => part.text)
                    .join(' ');
            } else {
                textContent = JSON.stringify(userMessage);
            }
        }
        
        // Limit the input to first 500 characters
        const truncatedMessage = textContent.slice(0, 500);
        
        const response = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful assistant that generates short, concise titles for chat conversations. Generate a title of 3-6 words that summarizes the topic or question. Do not use quotes or punctuation. Just output the title, nothing else.'
                },
                {
                    role: 'user',
                    content: `Generate a short title for a conversation that starts with this message:\n\n${truncatedMessage}`
                }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.3,
            max_tokens: 20,
            stream: false
        });
        
        const title = response.choices[0]?.message?.content?.trim() || 'New Chat';
        
        // Clean up the title - remove quotes and limit length
        return title
            .replace(/^["']|["']$/g, '') // Remove surrounding quotes
            .replace(/^Title:\s*/i, '') // Remove "Title:" prefix if present
            .slice(0, 50); // Limit length
            
    } catch (error) {
        console.error('Error generating chat title:', error);
        return 'New Chat';
    }
}

/**
 * Initialize IPC handlers for chat history
 * @param {Electron.IpcMain} ipcMain - The IPC main instance
 */
function initializeChatHistoryHandlers(ipcMain) {
    // Get list of all chats
    ipcMain.handle('chat-history-list', async () => {
        return listChats();
    });
    
    // Load a specific chat
    ipcMain.handle('chat-history-load', async (event, chatId) => {
        return loadChat(chatId);
    });
    
    // Create a new chat
    ipcMain.handle('chat-history-create', async (event, model, useResponsesApi) => {
        return createChat(model, useResponsesApi);
    });
    
    // Save/update a chat
    ipcMain.handle('chat-history-save', async (event, chat) => {
        saveChat(chat);
        return { success: true };
    });
    
    // Update chat messages
    ipcMain.handle('chat-history-update-messages', async (event, chatId, messages) => {
        return updateChatMessages(chatId, messages);
    });
    
    // Update chat title
    ipcMain.handle('chat-history-update-title', async (event, chatId, title) => {
        return updateChatTitle(chatId, title);
    });
    
    // Delete a chat
    ipcMain.handle('chat-history-delete', async (event, chatId) => {
        const success = deleteChat(chatId);
        return { success };
    });
    
    // Generate a title for a chat
    ipcMain.handle('chat-history-generate-title', async (event, userMessage) => {
        return generateChatTitle(userMessage);
    });
}

module.exports = {
    initialize,
    initializeChatHistoryHandlers,
    createChat,
    loadChat,
    saveChat,
    deleteChat,
    listChats,
    updateChatMessages,
    updateChatTitle,
    generateChatTitle
};

