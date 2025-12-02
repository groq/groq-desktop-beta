/**
 * Google OAuth Manager
 * Handles automatic token refresh for Google APIs (Gmail, Calendar, Drive)
 */

const https = require('https');
const { loadSettings } = require('./settingsManager');

// Token will be refreshed if it expires within this time (5 minutes buffer)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let appInstance = null;
let saveSettingsCallback = null;

/**
 * Initialize the Google OAuth Manager with app instance and save callback
 * @param {Object} app - Electron app instance
 * @param {Function} saveSettings - Function to save settings to disk
 */
function initialize(app, saveSettings) {
    appInstance = app;
    saveSettingsCallback = saveSettings;
    console.log('[GoogleOAuth] Manager initialized');
}

/**
 * Check if the current access token needs to be refreshed
 * @param {Object} settings - Current settings object
 * @returns {boolean} - True if token needs refresh
 */
function needsRefresh(settings) {
    // If no refresh token configured, can't refresh
    if (!settings.googleRefreshToken || !settings.googleClientId || !settings.googleClientSecret) {
        return false;
    }
    
    // If no access token or no expiry time, need to refresh
    if (!settings.googleOAuthToken || !settings.googleTokenExpiresAt) {
        return true;
    }
    
    // Check if token will expire within the buffer time
    const expiresAt = new Date(settings.googleTokenExpiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiresAt - now;
    
    return timeUntilExpiry < TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Refresh the Google OAuth access token using the refresh token
 * @param {Object} settings - Current settings object
 * @returns {Promise<{accessToken: string, expiresAt: Date} | null>} - New token info or null on failure
 */
async function refreshAccessToken(settings) {
    const { googleRefreshToken, googleClientId, googleClientSecret } = settings;
    
    if (!googleRefreshToken || !googleClientId || !googleClientSecret) {
        console.warn('[GoogleOAuth] Missing credentials for token refresh');
        return null;
    }
    
    console.log('[GoogleOAuth] Refreshing access token...');
    
    return new Promise((resolve, reject) => {
        const postData = new URLSearchParams({
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: googleRefreshToken,
            grant_type: 'refresh_token'
        }).toString();
        
        const options = {
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    
                    if (response.error) {
                        console.error('[GoogleOAuth] Token refresh error:', response.error, response.error_description);
                        resolve(null);
                        return;
                    }
                    
                    const accessToken = response.access_token;
                    const expiresIn = response.expires_in || 3600; // Default to 1 hour
                    const expiresAt = new Date(Date.now() + (expiresIn * 1000));
                    
                    console.log(`[GoogleOAuth] Token refreshed successfully, expires in ${expiresIn} seconds`);
                    
                    resolve({
                        accessToken,
                        expiresAt: expiresAt.toISOString()
                    });
                } catch (parseError) {
                    console.error('[GoogleOAuth] Error parsing token response:', parseError);
                    resolve(null);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('[GoogleOAuth] Token refresh request error:', error);
            resolve(null);
        });
        
        req.write(postData);
        req.end();
    });
}

/**
 * Get a valid access token, refreshing if necessary
 * This is the main function to call before making Google API requests
 * @param {Object} settings - Current settings object  
 * @returns {Promise<{token: string, settings: Object}>} - Valid access token and potentially updated settings
 */
async function getValidAccessToken(settings) {
    // Check if we need to refresh
    if (needsRefresh(settings)) {
        const newTokenInfo = await refreshAccessToken(settings);
        
        if (newTokenInfo) {
            // Update settings with new token
            const updatedSettings = {
                ...settings,
                googleOAuthToken: newTokenInfo.accessToken,
                googleTokenExpiresAt: newTokenInfo.expiresAt
            };
            
            // Persist the new token to settings file
            if (saveSettingsCallback) {
                try {
                    await saveSettingsCallback(updatedSettings);
                    console.log('[GoogleOAuth] Saved refreshed token to settings');
                } catch (error) {
                    console.error('[GoogleOAuth] Failed to save refreshed token:', error);
                }
            }
            
            return {
                token: newTokenInfo.accessToken,
                settings: updatedSettings
            };
        }
    }
    
    // Return existing token
    return {
        token: settings.googleOAuthToken,
        settings
    };
}

/**
 * Validate that OAuth credentials are properly configured
 * @param {Object} settings - Current settings object
 * @returns {{isValid: boolean, hasRefreshCapability: boolean, message: string}}
 */
function validateCredentials(settings) {
    const hasAccessToken = !!settings.googleOAuthToken;
    const hasRefreshToken = !!settings.googleRefreshToken;
    const hasClientId = !!settings.googleClientId;
    const hasClientSecret = !!settings.googleClientSecret;
    
    const hasRefreshCapability = hasRefreshToken && hasClientId && hasClientSecret;
    
    if (!hasAccessToken && !hasRefreshCapability) {
        return {
            isValid: false,
            hasRefreshCapability: false,
            message: 'No Google OAuth credentials configured'
        };
    }
    
    if (hasAccessToken && !hasRefreshCapability) {
        return {
            isValid: true,
            hasRefreshCapability: false,
            message: 'Access token configured but no auto-refresh (token will expire)'
        };
    }
    
    if (hasRefreshCapability) {
        return {
            isValid: true,
            hasRefreshCapability: true,
            message: 'Auto-refresh enabled'
        };
    }
    
    return {
        isValid: false,
        hasRefreshCapability: false,
        message: 'Invalid credential configuration'
    };
}

/**
 * Manually trigger a token refresh (for testing or UI refresh button)
 * @returns {Promise<{success: boolean, message: string, expiresAt?: string}>}
 */
async function manualRefresh() {
    const settings = loadSettings();
    
    const validation = validateCredentials(settings);
    if (!validation.hasRefreshCapability) {
        return {
            success: false,
            message: 'Cannot refresh: missing refresh token or client credentials'
        };
    }
    
    const newTokenInfo = await refreshAccessToken(settings);
    
    if (!newTokenInfo) {
        return {
            success: false,
            message: 'Token refresh failed - check your credentials'
        };
    }
    
    // Update settings
    const updatedSettings = {
        ...settings,
        googleOAuthToken: newTokenInfo.accessToken,
        googleTokenExpiresAt: newTokenInfo.expiresAt
    };
    
    if (saveSettingsCallback) {
        await saveSettingsCallback(updatedSettings);
    }
    
    return {
        success: true,
        message: 'Token refreshed successfully',
        expiresAt: newTokenInfo.expiresAt
    };
}

/**
 * Get the current token status
 * @param {Object} settings - Current settings object
 * @returns {{hasToken: boolean, hasRefreshCapability: boolean, expiresAt: string | null, isExpired: boolean, expiresInMinutes: number | null}}
 */
function getTokenStatus(settings) {
    const validation = validateCredentials(settings);
    const hasToken = !!settings.googleOAuthToken;
    const expiresAt = settings.googleTokenExpiresAt;
    
    let isExpired = false;
    let expiresInMinutes = null;
    
    if (expiresAt) {
        const expiresAtMs = new Date(expiresAt).getTime();
        const now = Date.now();
        isExpired = expiresAtMs < now;
        expiresInMinutes = Math.round((expiresAtMs - now) / (60 * 1000));
    }
    
    return {
        hasToken,
        hasRefreshCapability: validation.hasRefreshCapability,
        expiresAt,
        isExpired,
        expiresInMinutes
    };
}

module.exports = {
    initialize,
    needsRefresh,
    refreshAccessToken,
    getValidAccessToken,
    validateCredentials,
    manualRefresh,
    getTokenStatus
};

