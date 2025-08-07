const BASE_MODEL_CONTEXT_SIZES = {
  default: {
    context: 8192,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "openai/gpt-oss-20b": {
    context: 131072,
    vision_supported: false,
    builtin_tools_supported: true,
  },
  "openai/gpt-oss-120b": {
    context: 131072,
    vision_supported: false,
    builtin_tools_supported: true,
  },
  "moonshotai/kimi-k2-instruct": {
    context: 131072,
    vision_supported: true,
    builtin_tools_supported: false,
  },
  "meta-llama/llama-4-scout-17b-16e-instruct": {
    context: 131072,
    vision_supported: true,
    builtin_tools_supported: false,
  },
  "meta-llama/llama-4-maverick-17b-128e-instruct": {
    context: 131072,
    vision_supported: true,
    builtin_tools_supported: false,
  },
  "compound-beta": {
    context: 131072,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "qwen/qwen3-32b": {
    context: 131072,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "gemma2-9b-it": {
    context: 8192,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "llama-3.3-70b-versatile": {
    context: 128000,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "llama3-70b-8192": {
    context: 8192,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "llama3-8b-8192": {
    context: 8192,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "llama-3.1-8b-instant": {
    context: 128000,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "qwen-qwq-32b": {
    context: 128000,
    vision_supported: true,
    builtin_tools_supported: false,
  },
  "deepseek-r1-distill-llama-70b": {
    context: 128000,
    vision_supported: false,
    builtin_tools_supported: false,
  },
  "emberglow/small": {
    context: 8192,
    vision_supported: false,
    builtin_tools_supported: true,
  }
};

// Function to check if a model supports built-in tools
function supportsBuiltInTools(modelName, modelContextSizes) {
  // Check explicit configuration instead of name-based heuristic
  const modelInfo = modelContextSizes[modelName] || modelContextSizes['default'];
  return modelInfo?.builtin_tools_supported || false;
}

// Function to merge base models with custom models from settings
function getModelContextSizes(customModels = {}) {
  const mergedModels = { ...BASE_MODEL_CONTEXT_SIZES };
  
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

// Export both the base models and the function to get merged models
module.exports = { 
  MODEL_CONTEXT_SIZES: BASE_MODEL_CONTEXT_SIZES,
  getModelContextSizes,
  supportsBuiltInTools
};
