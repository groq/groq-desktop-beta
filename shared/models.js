// Default fallback model configuration
const DEFAULT_MODEL_CONFIG = {
  context: 8192,
  vision_supported: false,
  builtin_tools_supported: false,
};

// Cache for fetched models
let cachedModels = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Apply heuristics to determine model capabilities based on name
 */
function applyModelHeuristics(modelId, apiModelData) {
  const modelName = modelId.toLowerCase();
  
  // Use context_window from API if available
  const context = apiModelData?.context_window || DEFAULT_MODEL_CONFIG.context;
  
  // Heuristic: 'gpt-oss' in name = supports builtin tools
  const builtin_tools_supported = modelName.includes('gpt-oss');
  
  // Heuristic: 'llama-4' in name = supports vision
  const vision_supported = modelName.includes('llama-4');
  
  return {
    context,
    vision_supported,
    builtin_tools_supported,
  };
}

/**
 * Fetch models from Groq API
 */
async function fetchModelsFromAPI(apiKey) {
  if (!apiKey || apiKey === "<replace me>") {
    console.warn('No valid API key provided for fetching models');
    return null;
  }

  try {
    const https = require('https');
    const url = 'https://api.groq.com/openai/v1/models';
    
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      };

      https.get(url, options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              resolve(json);
            } catch (err) {
              console.error('Error parsing models API response:', err);
              reject(err);
            }
          } else {
            console.error('Error fetching models:', res.statusCode, data);
            reject(new Error(`API returned status ${res.statusCode}`));
          }
        });
      }).on('error', (err) => {
        console.error('Error fetching models from API:', err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error in fetchModelsFromAPI:', error);
    return null;
  }
}

/**
 * Convert API response to model context sizes format
 */
function convertAPIModelsToContextSizes(apiResponse) {
  const modelContextSizes = { default: DEFAULT_MODEL_CONFIG };
  
  if (!apiResponse?.data || !Array.isArray(apiResponse.data)) {
    console.warn('Invalid API response format');
    return modelContextSizes;
  }
  
  // Filter out non-chat models (like Whisper models)
  const chatModels = apiResponse.data.filter(model => {
    const modelName = model.id.toLowerCase();
    // Exclude audio/whisper models and guard models
    return !modelName.includes('whisper') && 
           !modelName.includes('guard') &&
           model.active === true;
  });
  
  chatModels.forEach(model => {
    const modelId = model.id;
    
    // Apply heuristics to determine model capabilities
    modelContextSizes[modelId] = applyModelHeuristics(modelId, model);
  });
  
  console.log(`Loaded ${chatModels.length} chat models from API`);
  return modelContextSizes;
}

/**
 * Get models with caching
 */
async function getModelsFromAPIWithCache(apiKey, forceRefresh = false) {
  const now = Date.now();
  
  // Return cached models if they're still fresh
  if (!forceRefresh && cachedModels && lastFetchTime && (now - lastFetchTime) < CACHE_DURATION) {
    console.log('Using cached models');
    return cachedModels;
  }
  
  // Fetch fresh models
  console.log('Fetching fresh models from API');
  const apiResponse = await fetchModelsFromAPI(apiKey);
  
  if (apiResponse) {
    cachedModels = convertAPIModelsToContextSizes(apiResponse);
    lastFetchTime = now;
    return cachedModels;
  }
  
  // If fetch failed and we have cached models, return them
  if (cachedModels) {
    console.warn('API fetch failed, using stale cached models');
    return cachedModels;
  }
  
  // If no cache and fetch failed, return default only
  console.warn('No models available, using default configuration only');
  return { default: DEFAULT_MODEL_CONFIG };
}

const BASE_MODEL_CONTEXT_SIZES = {
  default: DEFAULT_MODEL_CONFIG
};

// Function to check if a model supports built-in tools
function supportsBuiltInTools(modelName, modelContextSizes) {
  // Check explicit configuration instead of name-based heuristic
  const modelInfo = modelContextSizes[modelName] || modelContextSizes['default'];
  return modelInfo?.builtin_tools_supported || false;
}

// Function to merge base models with custom models from settings
function getModelContextSizes(customModels = {}, apiModels = null) {
  // Start with API models if available, otherwise use base models
  const mergedModels = apiModels ? { ...apiModels } : { ...BASE_MODEL_CONTEXT_SIZES };
  
  // Add custom models to the merged object
  Object.entries(customModels).forEach(([modelId, config]) => {
    // Use explicit configuration only - no name-based heuristic
    mergedModels[modelId] = {
      context: config.context || 8192,
      vision_supported: config.vision_supported || false,
      builtin_tools_supported: config.builtin_tools_supported || false,
      displayName: config.displayName || modelId,
      isCustom: true
    };
  });
  
  return mergedModels;
}

// Export all functions
module.exports = { 
  MODEL_CONTEXT_SIZES: BASE_MODEL_CONTEXT_SIZES,
  getModelContextSizes,
  supportsBuiltInTools,
  getModelsFromAPIWithCache,
  fetchModelsFromAPI,
  convertAPIModelsToContextSizes,
  applyModelHeuristics
};
