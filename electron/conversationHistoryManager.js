const fs = require('fs');
const path = require('path');

let appInstance; // To store app instance for userData path

/**
 * Initializes the conversation history manager
 * @param {Electron.App} app - The Electron app instance
 */
function initializeConversationHistoryManager(app) {
    appInstance = app;
    
    // Ensure conversations directory exists
    const conversationsDir = getConversationsDirectory();
    if (!fs.existsSync(conversationsDir)) {
        fs.mkdirSync(conversationsDir, { recursive: true });
        console.log('Created conversations directory:', conversationsDir);
    }
    
    // Ensure recent conversations file exists
    const recentConversationsPath = getRecentConversationsPath();
    if (!fs.existsSync(recentConversationsPath)) {
        fs.writeFileSync(recentConversationsPath, JSON.stringify([], null, 2));
        console.log('Created recent conversations file:', recentConversationsPath);
    }
}

/**
 * Gets the conversations directory path
 * @returns {string} The conversations directory path
 */
function getConversationsDirectory() {
    if (!appInstance) {
        throw new Error('App instance not initialized in conversationHistoryManager');
    }
    const userDataPath = appInstance.getPath('userData');
    return path.join(userDataPath, 'conversations');
}

/**
 * Gets the recent conversations file path
 * @returns {string} The recent conversations file path
 */
function getRecentConversationsPath() {
    return path.join(getConversationsDirectory(), 'recent-conversations.json');
}

/**
 * Gets the path for a specific conversation
 * @param {string} conversationId - The conversation ID
 * @returns {string} The conversation directory path
 */
function getConversationPath(conversationId) {
    return path.join(getConversationsDirectory(), `conversation-${conversationId}`);
}

/**
 * Generates a conversation title from the first user message
 * @param {Array} messages - Array of messages
 * @returns {string} Generated title
 */
function generateConversationTitle(messages) {
    // Find the first user message
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (!firstUserMessage) return 'New Conversation';
    
    // Extract text content
    let text = '';
    if (typeof firstUserMessage.content === 'string') {
        text = firstUserMessage.content;
    } else if (Array.isArray(firstUserMessage.content)) {
        // Extract text from content array (for messages with images)
        const textParts = firstUserMessage.content.filter(part => part.type === 'text');
        text = textParts.map(part => part.text).join(' ');
    }
    
    // Truncate and clean up
    text = text.trim();
    if (text.length > 50) {
        text = text.substring(0, 47) + '...';
    }
    
    return text || 'New Conversation';
}

/**
 * Cleans messages for storage (ensures OpenAI API format)
 * @param {Array} messages - Array of messages to clean
 * @returns {Array} Cleaned messages array
 */
function cleanMessagesForStorage(messages) {
    return messages.map(msg => {
        const cleanedMsg = { ...msg };
        
        // Remove internal fields that shouldn't be stored
        delete cleanedMsg.isStreaming;
        delete cleanedMsg.liveReasoning;
        delete cleanedMsg.liveExecutedTools;
        
        // Keep reasoning and executed_tools for compound-beta models
        // These are part of the official response format
        
        return cleanedMsg;
    });
}

/**
 * Gets the next conversation ID
 * @returns {string} The next numeric conversation ID
 */
function getNextConversationId() {
    try {
        const conversationsDir = getConversationsDirectory();
        if (!fs.existsSync(conversationsDir)) {
            return '1';
        }
        
        // Get all conversation directories
        const entries = fs.readdirSync(conversationsDir);
        const conversationDirs = entries.filter(entry => {
            const fullPath = path.join(conversationsDir, entry);
            return fs.statSync(fullPath).isDirectory() && entry.startsWith('conversation-');
        });
        
        // Extract numeric IDs
        const ids = conversationDirs
            .map(dir => dir.replace('conversation-', ''))
            .map(id => parseInt(id, 10))
            .filter(id => !isNaN(id));
        
        // Return next ID
        return ids.length === 0 ? '1' : String(Math.max(...ids) + 1);
    } catch (error) {
        console.error('Error getting next conversation ID:', error);
        return '1';
    }
}

/**
 * Saves a conversation to disk
 * @param {string} conversationId - The conversation ID (if null, generates new one)
 * @param {Array} messages - Array of messages in OpenAI format
 * @param {Object} options - Additional options (title, model, etc.)
 * @returns {Object} Result object with success, conversationId, and any error
 */
async function saveConversation(conversationId, messages, options = {}) {
    try {
        // Generate new ID if not provided
        if (!conversationId) {
            conversationId = getNextConversationId();
        }
        
        const conversationDir = getConversationPath(conversationId);
        
        // Create conversation directory if it doesn't exist
        if (!fs.existsSync(conversationDir)) {
            fs.mkdirSync(conversationDir, { recursive: true });
        }
        
        // Clean messages for storage
        const cleanedMessages = cleanMessagesForStorage(messages);
        
        // Prepare metadata
        const now = new Date().toISOString();
        const metadata = {
            id: conversationId,
            title: options.title || generateConversationTitle(cleanedMessages),
            model: options.model || 'unknown',
            createdAt: options.createdAt || now,
            updatedAt: now,
            messageCount: cleanedMessages.length,
            lastMessage: cleanedMessages.length > 0 ? cleanedMessages[cleanedMessages.length - 1] : null
        };
        
        // Write metadata and messages
        const metadataPath = path.join(conversationDir, 'metadata.json');
        const messagesPath = path.join(conversationDir, 'messages.json');
        
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        fs.writeFileSync(messagesPath, JSON.stringify(cleanedMessages, null, 2));
        
        // Update recent conversations
        await updateRecentConversations(conversationId);
        
        return { success: true, conversationId, metadata };
        
    } catch (error) {
        console.error('Error saving conversation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Loads a conversation from disk
 * @param {string} conversationId - The conversation ID
 * @returns {Object} Result object with success, conversation data, and any error
 */
async function loadConversation(conversationId) {
    try {
        const conversationDir = getConversationPath(conversationId);
        
        if (!fs.existsSync(conversationDir)) {
            return { success: false, error: 'Conversation not found' };
        }
        
        const metadataPath = path.join(conversationDir, 'metadata.json');
        const messagesPath = path.join(conversationDir, 'messages.json');
        
        if (!fs.existsSync(metadataPath) || !fs.existsSync(messagesPath)) {
            return { success: false, error: 'Conversation files incomplete' };
        }
        
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
        
        // Update recent conversations (move to top)
        await updateRecentConversations(conversationId);
        
        return {
            success: true,
            conversation: {
                metadata,
                messages
            }
        };
        
    } catch (error) {
        console.error('Error loading conversation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Lists recent conversations with metadata
 * @param {number} limit - Maximum number of conversations to return
 * @returns {Object} Result object with success, conversations array, and any error
 */
async function listRecentConversations(limit = 50) {
    try {
        const recentConversationsPath = getRecentConversationsPath();
        
        if (!fs.existsSync(recentConversationsPath)) {
            return { success: true, conversations: [] };
        }
        
        const recentIds = JSON.parse(fs.readFileSync(recentConversationsPath, 'utf8'));
        const conversations = [];
        
        for (const conversationId of recentIds.slice(0, limit)) {
            try {
                const conversationDir = getConversationPath(conversationId);
                const metadataPath = path.join(conversationDir, 'metadata.json');
                
                if (fs.existsSync(metadataPath)) {
                    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    conversations.push(metadata);
                } else {
                    console.warn(`Metadata missing for conversation ${conversationId}`);
                }
            } catch (error) {
                console.warn(`Error loading metadata for conversation ${conversationId}:`, error);
            }
        }
        
        return { success: true, conversations };
        
    } catch (error) {
        console.error('Error listing conversations:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Deletes a conversation from disk
 * @param {string} conversationId - The conversation ID
 * @returns {Object} Result object with success and any error
 */
async function deleteConversation(conversationId) {
    try {
        const conversationDir = getConversationPath(conversationId);
        
        if (!fs.existsSync(conversationDir)) {
            return { success: false, error: 'Conversation not found' };
        }
        
        // Remove directory and all contents
        fs.rmSync(conversationDir, { recursive: true, force: true });
        
        // Remove from recent conversations
        await removeFromRecentConversations(conversationId);
        
        console.log(`Conversation ${conversationId} deleted successfully`);
        return { success: true };
        
    } catch (error) {
        console.error('Error deleting conversation:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Updates the recent conversations list
 * @param {string} conversationId - The conversation ID to add/move to top
 */
async function updateRecentConversations(conversationId) {
    try {
        const recentConversationsPath = getRecentConversationsPath();
        let recentIds = [];
        
        if (fs.existsSync(recentConversationsPath)) {
            recentIds = JSON.parse(fs.readFileSync(recentConversationsPath, 'utf8'));
        }
        
        // Remove existing entry if present
        recentIds = recentIds.filter(id => id !== conversationId);
        
        // Add to front
        recentIds.unshift(conversationId);
        
        // Keep only the most recent 100
        recentIds = recentIds.slice(0, 100);
        
        fs.writeFileSync(recentConversationsPath, JSON.stringify(recentIds, null, 2));
        
    } catch (error) {
        console.error('Error updating recent conversations:', error);
    }
}

/**
 * Removes a conversation from the recent conversations list
 * @param {string} conversationId - The conversation ID to remove
 */
async function removeFromRecentConversations(conversationId) {
    try {
        const recentConversationsPath = getRecentConversationsPath();
        
        if (!fs.existsSync(recentConversationsPath)) return;
        
        let recentIds = JSON.parse(fs.readFileSync(recentConversationsPath, 'utf8'));
        recentIds = recentIds.filter(id => id !== conversationId);
        
        fs.writeFileSync(recentConversationsPath, JSON.stringify(recentIds, null, 2));
        
    } catch (error) {
        console.error('Error removing from recent conversations:', error);
    }
}

/**
 * Updates conversation metadata (title, etc.)
 * @param {string} conversationId - The conversation ID
 * @param {Object} updates - Fields to update
 * @returns {Object} Result object with success and any error
 */
async function updateConversationMetadata(conversationId, updates) {
    try {
        const conversationDir = getConversationPath(conversationId);
        const metadataPath = path.join(conversationDir, 'metadata.json');
        
        if (!fs.existsSync(metadataPath)) {
            return { success: false, error: 'Conversation not found' };
        }
        
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        
        // Update fields
        Object.assign(metadata, updates, {
            updatedAt: new Date().toISOString()
        });
        
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
        
        return { success: true, metadata };
        
    } catch (error) {
        console.error('Error updating conversation metadata:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Initializes IPC handlers for conversation history
 * @param {Electron.IpcMain} ipcMain - The IPC main instance
 * @param {Electron.App} app - The Electron app instance
 */
function initializeConversationHistoryHandlers(ipcMain, app) {
    // Initialize the manager
    initializeConversationHistoryManager(app);
    
    // Register IPC handlers
    ipcMain.handle('conversation-save', async (event, conversationId, messages, options) => {
        return await saveConversation(conversationId, messages, options);
    });
    
    ipcMain.handle('conversation-load', async (event, conversationId) => {
        return await loadConversation(conversationId);
    });
    
    ipcMain.handle('conversation-list', async (event, limit) => {
        return await listRecentConversations(limit);
    });
    
    ipcMain.handle('conversation-delete', async (event, conversationId) => {
        return await deleteConversation(conversationId);
    });
    
    ipcMain.handle('conversation-update-metadata', async (event, conversationId, updates) => {
        return await updateConversationMetadata(conversationId, updates);
    });
    
    console.log('Conversation history IPC handlers registered');
}

module.exports = {
    initializeConversationHistoryHandlers,
    saveConversation,
    loadConversation,
    listRecentConversations,
    deleteConversation,
    updateConversationMetadata
};