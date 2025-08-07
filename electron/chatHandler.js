const Groq = require('groq-sdk');
const { pruneMessageHistory } = require('./messageUtils');
const { supportsBuiltInTools } = require('../shared/models');

function validateApiKey(settings) {
    if (!settings.GROQ_API_KEY || settings.GROQ_API_KEY === "<replace me>") {
        throw new Error("API key not configured. Please add your GROQ API key in settings.");
    }
}

function determineModel(model, settings, modelContextSizes) {
    const modelToUse = model || settings.model || "llama-3.3-70b-versatile";
    const modelInfo = modelContextSizes[modelToUse] || modelContextSizes['default'] || { context: 8192, vision_supported: false };
    return { modelToUse, modelInfo };
}

function checkVisionSupport(messages, modelInfo, modelToUse, event) {
    const hasImages = messages.some(msg =>
        msg.role === 'user' &&
        Array.isArray(msg.content) &&
        msg.content.some(part => part.type === 'image_url')
    );

    if (hasImages && !modelInfo.vision_supported) {
        console.warn(`Attempting to use images with non-vision model: ${modelToUse}`);
        event.sender.send('chat-stream-error', { error: `The selected model (${modelToUse}) does not support image inputs. Please select a vision-capable model.` });
        return false; // Return false to indicate vision check failed
    }
    
    return true; // Return true to indicate vision check passed
}

function prepareTools(discoveredTools) {
    // Prepare tools for the API call
    const tools = (discoveredTools || []).map(tool => ({
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema || {} // Ensure parameters is an object
        }
    }));
    console.log(`Prepared ${tools.length} tools for the API call.`);
    return tools;
}

function cleanMessages(messages) {
    // Clean and prepare messages for the API
    // 1. Remove internal fields like 'reasoning', 'isStreaming'
    // 2. Ensure correct content format (user: array, assistant: string, tool: string)
    return messages.map(msg => {
        // Create a clean copy, then delete unwanted properties
        const cleanMsg = { ...msg };
        delete cleanMsg.reasoning;
        delete cleanMsg.isStreaming;

        // Ensure user content is array format for vision support
        if (cleanMsg.role === 'user') {
            if (typeof cleanMsg.content === 'string') {
                cleanMsg.content = [{ type: 'text', text: cleanMsg.content }];
            } else if (!Array.isArray(cleanMsg.content)) {
                cleanMsg.content = [{ type: 'text', text: '' }];
            }
            cleanMsg.content = cleanMsg.content.map(part => ({ type: part.type || 'text', ...part }));
        }

        // Ensure assistant content is string format
        if (cleanMsg.role === 'assistant' && typeof cleanMsg.content !== 'string') {
            if (Array.isArray(cleanMsg.content)) {
                cleanMsg.content = cleanMsg.content.filter(p => p.type === 'text').map(p => p.text).join('');
            } else {
                try {
                    cleanMsg.content = JSON.stringify(cleanMsg.content);
                } catch { cleanMsg.content = '[Non-string content]'; }
            }
        }

        // Ensure tool content is stringified
        if (cleanMsg.role === 'tool' && typeof cleanMsg.content !== 'string') {
            try {
                cleanMsg.content = JSON.stringify(cleanMsg.content);
            } catch {
                cleanMsg.content = "[Error stringifying tool content]";
            }
        }
        return cleanMsg;
    });
}

function buildApiParams(prunedMessages, modelToUse, settings, tools, modelContextSizes) {
    let systemPrompt = "You are a helpful assistant capable of using tools. Use tools only when necessary and relevant to the user's request. Format responses using Markdown.";
    if (settings.customSystemPrompt && settings.customSystemPrompt.trim()) {
        systemPrompt += `\n\n${settings.customSystemPrompt.trim()}`;
    }

    // Prepare built-in tools if enabled and supported by the model
    const builtInTools = [];
    if (supportsBuiltInTools(modelToUse, modelContextSizes) && settings.builtInTools) {
        if (settings.builtInTools.codeInterpreter) {
            builtInTools.push({ type: "code_interpreter" });
            console.log('Code interpreter tool enabled for model:', modelToUse);
        }
        if (settings.builtInTools.browserSearch) {
            builtInTools.push({ type: "browser_search" });
            console.log('Browser search tool enabled for model:', modelToUse);
        }
    }

    // Combine MCP tools and built-in tools
    const allTools = [...tools];
    if (builtInTools.length > 0) {
        // For built-in tools, we add them directly (not as functions)
        allTools.push(...builtInTools);
    }

    return {
        messages: [{ role: "system", content: systemPrompt }, ...prunedMessages],
        model: modelToUse,
        temperature: settings.temperature ?? 0.7,
        top_p: settings.top_p ?? 0.95,
        ...(allTools.length > 0 && { tools: allTools, tool_choice: "auto" }),
        stream: true
    };
}

// Processes individual stream chunks for compound-beta and regular models
function processStreamChunk(chunk, event, accumulatedData) {
    if (!chunk.choices?.[0]) return;

    const { delta } = chunk.choices[0];

    if (accumulatedData.isFirstChunk) {
        accumulatedData.streamId = chunk.id;
        event.sender.send('chat-stream-start', {
            id: accumulatedData.streamId,
            role: delta?.role || "assistant"
        });
        accumulatedData.isFirstChunk = false;
    }

    if (delta?.content) {
        accumulatedData.content += delta.content;
        event.sender.send('chat-stream-content', { content: delta.content });
    }

    // Compound-beta reasoning streaming
    if (delta?.reasoning) {
        accumulatedData.reasoning += delta.reasoning;
        event.sender.send('chat-stream-reasoning', {
            reasoning: delta.reasoning,
            accumulated: accumulatedData.reasoning
        });
    }

    // Compound-beta executed tools streaming - handles progressive tool execution
    if (delta?.executed_tools?.length > 0) {
        for (const executedTool of delta.executed_tools) {
            let existingTool = accumulatedData.executedTools.find(t => t.index === executedTool.index);

            if (!existingTool) {
                // First delta: tool starts executing
                const newTool = {
                    index: executedTool.index,
                    type: executedTool.type,
                    arguments: executedTool.arguments || "",
                    output: executedTool.output || null,
                    name: executedTool.name || "",
                    search_results: executedTool.search_results || null
                };
                accumulatedData.executedTools.push(newTool);
                
                console.log(`[Tool Execution Start] Index: ${executedTool.index}, Type: ${executedTool.type}, Name: ${executedTool.name}`);
                if (executedTool.arguments) {
                    console.log(`[Tool Arguments] Index: ${executedTool.index}:`, executedTool.arguments);
                }

                event.sender.send('chat-stream-tool-execution', {
                    type: 'start',
                    tool: {
                        index: executedTool.index,
                        type: executedTool.type,
                        arguments: executedTool.arguments,
                        name: executedTool.name
                    }
                });
            } else {
                // Second delta: tool execution completes with output
                // Only update output and search_results, NOT arguments or name (they should already be set from start)
                
                // Log a warning if arguments or name are being sent in completion delta (they shouldn't be)
                if (executedTool.arguments && executedTool.arguments !== existingTool.arguments) {
                    console.warn(`[WARNING] Tool completion delta contains different arguments! Index: ${executedTool.index}`);
                    console.warn(`  Existing arguments: ${existingTool.arguments}`);
                    console.warn(`  Delta arguments (ignored): ${executedTool.arguments}`);
                }
                if (executedTool.name && executedTool.name !== existingTool.name) {
                    console.warn(`[WARNING] Tool completion delta contains different name! Index: ${executedTool.index}`);
                    console.warn(`  Existing name: ${existingTool.name}`);
                    console.warn(`  Delta name (ignored): ${executedTool.name}`);
                }
                
                // Only update output and search_results
                if (executedTool.search_results) existingTool.search_results = executedTool.search_results;
                if (executedTool.output !== undefined) {
                    existingTool.output = executedTool.output;
                    
                    console.log(`[Tool Execution Complete] Index: ${existingTool.index}, Type: ${existingTool.type}, Name: ${existingTool.name}`);
                    console.log(`[Tool Arguments Preserved] Index: ${existingTool.index}:`, existingTool.arguments);
                    if (existingTool.output) {
                        console.log(`[Tool Output] Index: ${existingTool.index}:`, existingTool.output.substring(0, 200) + (existingTool.output.length > 200 ? '...' : ''));
                    }
                    
                    // Send complete event with fully updated tool data
                    event.sender.send('chat-stream-tool-execution', {
                        type: 'complete',
                        tool: existingTool
                    });
                }
            }
        }
    }

    // Regular MCP tool calls - accumulate incrementally streamed tool calls
    if (delta?.tool_calls?.length > 0) {
        for (const toolCallDelta of delta.tool_calls) {
            let existingCall = accumulatedData.toolCalls.find(tc => tc.index === toolCallDelta.index);

            if (!existingCall) {
                accumulatedData.toolCalls.push({
                    index: toolCallDelta.index,
                    id: toolCallDelta.id || `tool_${Date.now()}_${toolCallDelta.index}`,
                    type: toolCallDelta.type || 'function',
                    function: {
                        name: toolCallDelta.function?.name || "",
                        arguments: toolCallDelta.function?.arguments || ""
                    }
                });
            } else {
                if (toolCallDelta.function?.arguments) {
                    existingCall.function.arguments += toolCallDelta.function.arguments;
                }
                if (toolCallDelta.function?.name) {
                    existingCall.function.name = toolCallDelta.function.name;
                }
                if (toolCallDelta.id) {
                    existingCall.id = toolCallDelta.id;
                }
            }
        }
        event.sender.send('chat-stream-tool-calls', { tool_calls: accumulatedData.toolCalls });
    }

    return chunk.choices[0].finish_reason;
}

function handleStreamCompletion(event, accumulatedData, finishReason) {
    event.sender.send('chat-stream-complete', {
        content: accumulatedData.content,
        role: "assistant",
        tool_calls: accumulatedData.toolCalls.length > 0 ? accumulatedData.toolCalls : undefined,
        reasoning: accumulatedData.reasoning || undefined,
        executed_tools: accumulatedData.executedTools.length > 0 ? accumulatedData.executedTools : undefined,
        finish_reason: finishReason
    });
}

// Executes stream with retry logic for tool_use_failed errors
async function executeStreamWithRetry(groq, chatCompletionParams, event) {
    const MAX_TOOL_USE_RETRIES = 3;
    let retryCount = 0;

    while (retryCount <= MAX_TOOL_USE_RETRIES) {
        try {
            const accumulatedData = {
                content: "",
                toolCalls: [],
                reasoning: "",
                executedTools: [],
                isFirstChunk: true,
                streamId: null
            };

            const stream = await groq.chat.completions.create(chatCompletionParams);

            for await (const chunk of stream) {
                const finishReason = processStreamChunk(chunk, event, accumulatedData);

                if (finishReason) {
                    handleStreamCompletion(event, accumulatedData, finishReason);
                    return;
                }
            }

            event.sender.send('chat-stream-error', { error: "Stream ended unexpectedly." });
            return;

        } catch (error) {
            const isToolUseFailedError = error?.error?.code === 'tool_use_failed' || error?.message?.includes('tool_use_failed');

            if (isToolUseFailedError && retryCount < MAX_TOOL_USE_RETRIES) {
                retryCount++;
                continue;
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            event.sender.send('chat-stream-error', {
                error: `Failed to get chat completion: ${errorMessage}`,
                details: error
            });
            return;
        }
    }

    event.sender.send('chat-stream-error', {
        error: `The model repeatedly failed to use tools correctly after ${MAX_TOOL_USE_RETRIES + 1} attempts. Please try rephrasing your request.`
    });
}

/**
 * Handles streaming chat completions with support for compound-beta model features.
 * Supports progressive reasoning display, executed tools streaming, and MCP tool calls.
 * 
 * @param {Electron.IpcMainEvent} event - The IPC event object
 * @param {Array<object>} messages - Chat history messages
 * @param {string} model - Model name (optional, falls back to settings)
 * @param {object} settings - App settings including API key and model config
 * @param {object} modelContextSizes - Model capability metadata
 * @param {Array<object>} discoveredTools - Available MCP tools
 */
async function handleChatStream(event, messages, model, settings, modelContextSizes, discoveredTools) {
    try {
        validateApiKey(settings);
        const { modelToUse, modelInfo } = determineModel(model, settings, modelContextSizes);
        const visionCheckPassed = checkVisionSupport(messages, modelInfo, modelToUse, event);
        
        // If vision check failed, return early
        if (!visionCheckPassed) {
            return;
        }

        const groqConfig = { apiKey: settings.GROQ_API_KEY };
        
        // Use custom API base URL if provided
        if (settings.customApiBaseUrl && settings.customApiBaseUrl.trim()) {
            let customBaseUrl = settings.customApiBaseUrl.trim();
            
            // Remove trailing slash if present
            customBaseUrl = customBaseUrl.replace(/\/$/, '');
            
            // If the URL ends with /openai/v1, remove it since the Groq SDK will append it
            if (customBaseUrl.endsWith('/openai/v1')) {
                customBaseUrl = customBaseUrl.replace(/\/openai\/v1$/, '');
            }
            
            groqConfig.baseURL = customBaseUrl;
            console.log(`Using custom base URL: ${customBaseUrl} (Groq SDK will append /openai/v1/chat/completions)`);
        }
        
        const groq = new Groq(groqConfig);
        const tools = prepareTools(discoveredTools);
        const cleanedMessages = cleanMessages(messages);
        const prunedMessages = pruneMessageHistory(cleanedMessages, modelToUse, modelContextSizes);
        const chatCompletionParams = buildApiParams(prunedMessages, modelToUse, settings, tools, modelContextSizes);

        await executeStreamWithRetry(groq, chatCompletionParams, event);
    } catch (outerError) {
        event.sender.send('chat-stream-error', { error: outerError.message || `Setup error: ${outerError}` });
    }
}

module.exports = { handleChatStream };
