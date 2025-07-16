const fs = require('fs');
const path = require('path');

let appInstance; // To store app instance for userData path

// Helper function to load settings with defaults and validation
function loadSettings() {
    if (!appInstance) {
        console.error("App instance not initialized in settingsManager.");
        // Return minimal defaults to avoid crashing downstream logic
        return {
            GROQ_API_KEY: "<replace me>",
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            top_p: 0.95,
            mcpServers: {},
            disabledMcpServers: [],
            customSystemPrompt: ''
        };
    }
    const userDataPath = appInstance.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    const defaultSettings = {
        GROQ_API_KEY: "<replace me>",
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
        top_p: 0.95,
        mcpServers: {},
        disabledMcpServers: [],
        customSystemPrompt: ''
    };

    try {
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            const loadedSettings = JSON.parse(data);

            // Merge defaults and ensure required fields exist, applying defaults if necessary
            const settings = { ...defaultSettings, ...loadedSettings };

            // Explicitly check and apply defaults for potentially missing/undefined fields
            settings.GROQ_API_KEY = settings.GROQ_API_KEY || defaultSettings.GROQ_API_KEY;
            settings.model = settings.model || defaultSettings.model;
            settings.temperature = settings.temperature ?? defaultSettings.temperature; // Use nullish coalescing
            settings.top_p = settings.top_p ?? defaultSettings.top_p;
            settings.mcpServers = settings.mcpServers || defaultSettings.mcpServers;
            settings.disabledMcpServers = settings.disabledMcpServers || defaultSettings.disabledMcpServers;
            settings.customSystemPrompt = settings.customSystemPrompt || defaultSettings.customSystemPrompt;

            // Optional: Persist the potentially updated settings back to file if defaults were applied
            // fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

            return settings;
        } else {
            // Create settings file with defaults if it doesn't exist
            fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
            console.log('Settings file created with defaults at:', settingsPath);
            return defaultSettings;
        }
    } catch (error) {
        console.error('Error reading or parsing settings:', error);
        // Return defaults in case of error
        return defaultSettings;
    }
}

function initializeSettingsHandlers(ipcMain, app) {
    appInstance = app; // Store app instance

    // Log settings path on initialization
    const userDataPath = appInstance.getPath('userData');
    const settingsPath = path.join(userDataPath, 'settings.json');
    console.log('SettingsManager Initialized. Settings file location:', settingsPath);

    // Handler for getting settings
    ipcMain.handle('get-settings', async () => {
      return loadSettings();
    });

    // Handler for getting settings file path
    ipcMain.handle('get-settings-path', async () => {
      const userDataPath = appInstance.getPath('userData'); // Use stored instance
      const settingsPath = path.join(userDataPath, 'settings.json');
      return settingsPath;
    });

    // Handler for reloading settings from disk
    ipcMain.handle('reload-settings', async () => {
      try {
        const settings = loadSettings(); // Reload and validate
        return { success: true, settings };
      } catch (error) {
         console.error('Error reloading settings via handler:', error);
         return { success: false, error: error.message };
      }
    });

    // Handler for saving settings
    ipcMain.handle('save-settings', async (event, settings) => {
      const userDataPath = appInstance.getPath('userData'); // Use stored instance
      const settingsPath = path.join(userDataPath, 'settings.json');

      try {
        // Basic validation before saving
        if (!settings || typeof settings !== 'object') {
            throw new Error("Invalid settings object provided.");
        }
         // Optionally add more validation here
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
      } catch (error) {
        console.error('Error saving settings:', error);
        return { success: false, error: error.message };
      }
    });
}

module.exports = {
    loadSettings,
    initializeSettingsHandlers
}; 