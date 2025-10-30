const Groq = require('groq-sdk');
const { pruneMessageHistory } = require('./messageUtils');
const { supportsBuiltInTools } = require('../shared/models');

// Track active streams to allow cancellation
const activeStreams = new Map();

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
    // 1. Remove internal fields like 'reasoning', 'isStreaming', 'reasoningDuration', etc.
    // 2. Ensure correct content format (user: array, assistant: string, tool: string)
    return messages.map(msg => {
        // Create a clean copy, then delete unwanted properties
        const cleanMsg = { ...msg };
        delete cleanMsg.reasoning;
        delete cleanMsg.isStreaming;
        delete cleanMsg.reasoningDuration;
        delete cleanMsg.reasoningSummaries;
        delete cleanMsg.liveReasoning;
        delete cleanMsg.liveExecutedTools;
        delete cleanMsg.executed_tools;
        delete cleanMsg.reasoningStartTime;
        delete cleanMsg.usage;

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
    // Get current date/time with timezone
    const now = new Date();
    const dateTimeString = now.toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        timeZoneName: 'long',
        hour12: false
    });
    
    let systemPrompt = `You are a helpful assistant capable of using tools. Use tools only when necessary and relevant to the user's request. Format responses using Markdown.\n\nCurrent date and time: ${dateTimeString}`;
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

    // Check if the model contains "compound" in its name
    const isCompoundModel = modelToUse.toLowerCase().includes('compound');
    
    // Don't pass tools to compound models
    const shouldIncludeTools = allTools.length > 0 && !isCompoundModel;
    
    if (isCompoundModel && allTools.length > 0) {
        console.log(`Skipping tools for compound model: ${modelToUse}`);
    }

    const apiParams = {
        messages: [{ role: "system", content: systemPrompt }, ...prunedMessages],
        model: modelToUse,
        temperature: settings.temperature ?? 0.7,
        top_p: settings.top_p ?? 0.95,
        ...(shouldIncludeTools && { tools: allTools, tool_choice: "auto" }),
        stream: true
    };

    // Add reasoning_effort parameter for gpt-oss models
    if (modelToUse.includes('gpt-oss') && settings.reasoning_effort) {
        apiParams.reasoning_effort = settings.reasoning_effort;
        console.log(`Adding reasoning_effort: ${settings.reasoning_effort} for model: ${modelToUse}`);
    }

    return apiParams;
}

// Processes individual stream chunks for compound-beta and regular models
function processStreamChunk(chunk, event, accumulatedData, groq, streamId) {
    if (!chunk.choices?.[0]) return;

    const { delta } = chunk.choices[0];
    
    // Capture usage data if present (usually in the final chunk)
    if (chunk.x_groq?.usage) {
        accumulatedData.usage = chunk.x_groq.usage;
    }

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
        
        // If this is the first content token after reasoning, clear the summary interval
        if (accumulatedData.content === delta.content && accumulatedData.summaryInterval && accumulatedData.reasoning.length > 0) {
            clearInterval(accumulatedData.summaryInterval);
            accumulatedData.summaryInterval = null;
            console.log('[Backend] First content token received, cleared summary interval');
        }
    }

    // Reasoning streaming - supports both delta.reasoning and delta.reasoning_content
    // (different models use different field names)
    const reasoningDelta = delta?.reasoning || delta?.reasoning_content;
    if (reasoningDelta) {
        accumulatedData.reasoning += reasoningDelta;
        
        // Send reasoning to frontend so it knows reasoning is happening
        event.sender.send('chat-stream-reasoning', {
            reasoning: reasoningDelta,
            accumulated: accumulatedData.reasoning
        });
        
        // Start interval timer on first reasoning chunk
        if (!accumulatedData.summaryInterval) {
            console.log('[Backend] First reasoning chunk, starting summary interval');
            accumulatedData.lastSummarizedTime = Date.now();
            
            // Set up interval to check every 2 seconds
            accumulatedData.summaryInterval = setInterval(() => {
                const now = Date.now();
                const timeSinceLastSummary = now - accumulatedData.lastSummarizedTime;
                
                if (timeSinceLastSummary >= 2000 && accumulatedData.reasoning.length > 0) {
                    accumulatedData.lastSummarizedTime = now;
                    accumulatedData.summaryCount++;
                    
                    console.log(`[Backend] Interval triggered summary ${accumulatedData.summaryCount}, reasoning length: ${accumulatedData.reasoning.length}`);
                    
                    // Get the last 300 words for summarization
                    const last300Words = getLastNWords(accumulatedData.reasoning, 300);
                    
                    // Trigger summarization asynchronously (non-blocking)
                    summarizeReasoningChunk(groq, last300Words, event, streamId, accumulatedData.summaryCount)
                        .catch(err => console.error('[Backend] Error in background summarization:', err));
                }
            }, 2000);
        }
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
    // Clear the summary interval if it exists
    if (accumulatedData.summaryInterval) {
        clearInterval(accumulatedData.summaryInterval);
        console.log('[Backend] Cleared summary interval on completion');
    }
    
    event.sender.send('chat-stream-complete', {
        content: accumulatedData.content,
        role: "assistant",
        tool_calls: accumulatedData.toolCalls.length > 0 ? accumulatedData.toolCalls : undefined,
        reasoning: accumulatedData.reasoning || undefined,
        executed_tools: accumulatedData.executedTools.length > 0 ? accumulatedData.executedTools : undefined,
        finish_reason: finishReason,
        usage: accumulatedData.usage
    });
}

// Helper function to count words in text
function countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

// Helper function to get last N words from text
function getLastNWords(text, n) {
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    return words.slice(-n).join(' ');
}

// Summarize reasoning chunk using llama-3.1-8b-instant (non-blocking)
async function summarizeReasoningChunk(groq, reasoningText, event, streamId, summaryIndex) {
    try {
        console.log(`[Backend Summary ${summaryIndex}] Starting summarization for stream ${streamId}, text length: ${reasoningText.length}`);
        const response = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You must respond with ONLY 3-5 plain words. No markdown, no formatting, no punctuation, no explanations. Just 3-5 words describing the activity.'
                },
                {
                    role: 'user',
                    content: `What activity is happening here in 3-5 words:\n\n${reasoningText}\n\nRespond with ONLY 3-5 plain words:`
                }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.3,
            max_tokens: 10,
            stream: false
        });
        
        const summary = response.choices[0]?.message?.content?.trim() || 'Processing thoughts';
        console.log(`[Backend Summary ${summaryIndex}] Completed: "${summary}"`);
        console.log(`[Backend Summary ${summaryIndex}] Sending to frontend via chat-stream-reasoning-summary`);
        
        // Send the summary to the frontend with streamId and index
        event.sender.send('chat-stream-reasoning-summary', {
            streamId,
            summaryIndex,
            summary
        });
        
        return summary;
    } catch (error) {
        console.error(`[Backend Summary ${summaryIndex}] Error summarizing:`, error.message);
        const fallbackSummary = 'Analyzing reasoning';
        event.sender.send('chat-stream-reasoning-summary', {
            streamId,
            summaryIndex,
            summary: fallbackSummary
        });
        return fallbackSummary;
    }
}

// Executes stream with retry logic for tool_use_failed errors and tool call validation errors
async function executeStreamWithRetry(groq, chatCompletionParams, event, streamId) {
    const MAX_TOOL_USE_RETRIES = 25;
    let retryCount = 0;
    const baseTemperature = chatCompletionParams.temperature;

    while (retryCount <= MAX_TOOL_USE_RETRIES) {
        let accumulatedData = {
            content: "",
            toolCalls: [],
            reasoning: "",
            executedTools: [],
            isFirstChunk: true,
            streamId: null,
            reasoningSummaries: [],
            lastSummarizedTime: 0,
            summaryCount: 0,
            summaryInterval: null,
            usage: null
        };
        
        try {

            // Check if stream was cancelled before starting
            const streamInfo = activeStreams.get(streamId);
            if (!streamInfo || streamInfo.cancelled) {
                console.log(`Stream ${streamId} was cancelled before starting`);
                event.sender.send('chat-stream-cancelled', { streamId });
                activeStreams.delete(streamId);
                return;
            }

            const stream = await groq.chat.completions.create(chatCompletionParams);
            
            // Store the stream iterator for potential cancellation
            if (streamInfo) {
                streamInfo.stream = stream;
            }

            for await (const chunk of stream) {
                // Check if stream was cancelled during iteration
                const currentStreamInfo = activeStreams.get(streamId);
                if (!currentStreamInfo || currentStreamInfo.cancelled) {
                    console.log(`Stream ${streamId} was cancelled during processing`);
                    // Clear summary interval if it exists
                    if (accumulatedData.summaryInterval) {
                        clearInterval(accumulatedData.summaryInterval);
                        console.log('[Backend] Cleared summary interval on cancellation');
                    }
                    event.sender.send('chat-stream-cancelled', { streamId });
                    activeStreams.delete(streamId);
                    return;
                }

                const finishReason = processStreamChunk(chunk, event, accumulatedData, groq, streamId);

                if (finishReason) {
                    handleStreamCompletion(event, accumulatedData, finishReason);
                    activeStreams.delete(streamId);
                    return;
                }
            }

            // Clear summary interval before exiting
            if (accumulatedData.summaryInterval) {
                clearInterval(accumulatedData.summaryInterval);
                console.log('[Backend] Cleared summary interval on unexpected end');
            }
            
            activeStreams.delete(streamId);
            event.sender.send('chat-stream-error', { error: "Stream ended unexpectedly." });
            return;

        } catch (error) {
            // Check if this was a cancellation
            const streamInfo = activeStreams.get(streamId);
            if (streamInfo && streamInfo.cancelled) {
                console.log(`Stream ${streamId} error due to cancellation`);
                // Clear summary interval
                if (accumulatedData.summaryInterval) {
                    clearInterval(accumulatedData.summaryInterval);
                    console.log('[Backend] Cleared summary interval on error cancellation');
                }
                event.sender.send('chat-stream-cancelled', { streamId });
                activeStreams.delete(streamId);
                return;
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            const isToolUseFailedError = error?.error?.code === 'tool_use_failed' || errorMessage.includes('tool_use_failed');
            const isToolValidationError = errorMessage.includes('Tool call validation failed') || 
                                         errorMessage.includes('was not in request.tools');

            if ((isToolUseFailedError || isToolValidationError) && retryCount < MAX_TOOL_USE_RETRIES) {
                retryCount++;
                console.log(`Retrying due to tool error (attempt ${retryCount}/${MAX_TOOL_USE_RETRIES}): ${errorMessage}`);
                
                // Bump temperature by 0.05 per retry
                chatCompletionParams.temperature = baseTemperature + (retryCount * 0.05);
                console.log(`Adjusted temperature to ${chatCompletionParams.temperature} for retry ${retryCount}`);
                
                // Notify client of retry attempt
                event.sender.send('chat-stream-retry', {
                    attempt: retryCount,
                    maxAttempts: MAX_TOOL_USE_RETRIES,
                    error: errorMessage,
                    newTemperature: chatCompletionParams.temperature
                });
                
                // Append error to the last user message in the request (not in UI)
                const lastUserMessageIndex = chatCompletionParams.messages.map((m, i) => ({ role: m.role, index: i }))
                    .filter(m => m.role === 'user')
                    .pop()?.index;
                
                if (lastUserMessageIndex !== undefined) {
                    const lastUserMsg = chatCompletionParams.messages[lastUserMessageIndex];
                    
                    // Handle both string and array content formats
                    if (typeof lastUserMsg.content === 'string') {
                        lastUserMsg.content += `\n\n[Note: Previous attempt failed with error: ${errorMessage}]`;
                    } else if (Array.isArray(lastUserMsg.content)) {
                        // Find the last text part or add one
                        const lastTextPart = lastUserMsg.content.filter(p => p.type === 'text').pop();
                        if (lastTextPart) {
                            lastTextPart.text += `\n\n[Note: Previous attempt failed with error: ${errorMessage}]`;
                        } else {
                            lastUserMsg.content.push({
                                type: 'text',
                                text: `\n[Note: Previous attempt failed with error: ${errorMessage}]`
                            });
                        }
                    }
                }
                
                // Wait 0.5 seconds before retrying
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            // Clear summary interval
            if (accumulatedData.summaryInterval) {
                clearInterval(accumulatedData.summaryInterval);
            }
            
            activeStreams.delete(streamId);
            event.sender.send('chat-stream-error', {
                error: `Failed to get chat completion: ${errorMessage}`,
                details: error
            });
            return;
        }
    }

    activeStreams.delete(streamId);
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
    // Generate unique stream ID
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        // Register this stream as active
        activeStreams.set(streamId, {
            cancelled: false,
            stream: null,
            event: event
        });

        validateApiKey(settings);
        const { modelToUse, modelInfo } = determineModel(model, settings, modelContextSizes);
        const visionCheckPassed = checkVisionSupport(messages, modelInfo, modelToUse, event);
        
        // If vision check failed, return early
        if (!visionCheckPassed) {
            activeStreams.delete(streamId);
            return;
        }

        const groqConfig = { apiKey: settings.GROQ_API_KEY };
        
        // Use custom API base URL if enabled and provided (use exactly as provided)
        if (settings.customApiBaseUrlEnabled && settings.customApiBaseUrl && settings.customApiBaseUrl.trim()) {
            groqConfig.baseURL = settings.customApiBaseUrl.trim();
            console.log(`Using custom base URL: ${groqConfig.baseURL}`);
        }
        
        const groq = new Groq(groqConfig);
        
        // Monkey patch the SDK when using custom baseURL
        // Custom baseURL should end with /v1/ (e.g., http://example.com/v1/ or https://api.groq.com/openai/v1/)
        if (settings.customApiBaseUrlEnabled && settings.customApiBaseUrl && settings.customApiBaseUrl.trim()) {
            const originalPost = groq.post.bind(groq);
            const originalBuildURL = groq.buildURL.bind(groq);
            
            // Intercept buildURL to strip /openai/v1/ prefix since custom baseURL includes the full path
            groq.buildURL = function(path, query, defaultBaseURL) {
                const originalPath = path;
                // Strip the /openai/v1/ prefix - custom baseURL should include the full path up to /v1/
                if (path.startsWith('/openai/v1/')) {
                    path = path.replace(/^\/openai\/v1/, '');
                    console.log(`[URL Rewrite] Original path: ${originalPath} -> New path: ${path}`);
                }
                const finalURL = originalBuildURL(path, query, defaultBaseURL);
                console.log(`[Final URL] ${finalURL}`);
                return finalURL;
            };
            
            groq.post = function(path, ...args) {
                return originalPost(path, ...args);
            };
        }
        
        const tools = prepareTools(discoveredTools);
        const cleanedMessages = cleanMessages(messages);
        const prunedMessages = pruneMessageHistory(cleanedMessages, modelToUse, modelContextSizes);
        const chatCompletionParams = buildApiParams(prunedMessages, modelToUse, settings, tools, modelContextSizes);

        await executeStreamWithRetry(groq, chatCompletionParams, event, streamId);
    } catch (outerError) {
        activeStreams.delete(streamId);
        event.sender.send('chat-stream-error', { error: outerError.message || `Setup error: ${outerError}` });
    }
}

/**
 * Stops an active chat stream
 * @param {string} streamId - The ID of the stream to stop (optional, stops all if not provided)
 */
function stopChatStream(streamId) {
    if (streamId) {
        const streamInfo = activeStreams.get(streamId);
        if (streamInfo) {
            console.log(`Stopping stream ${streamId}`);
            streamInfo.cancelled = true;
            // Note: The actual stream interruption happens in the iteration loop
        }
    } else {
        // Stop all active streams
        console.log(`Stopping all active streams (${activeStreams.size} total)`);
        for (const [id, streamInfo] of activeStreams.entries()) {
            streamInfo.cancelled = true;
        }
    }
}

module.exports = { handleChatStream, stopChatStream };
