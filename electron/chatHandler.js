const Groq = require('groq-sdk');
const fetch = require('node-fetch');
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

function prepareTools(discoveredTools, isResponsesApi = false) {
    // Prepare tools for the API call
    const tools = (discoveredTools || []).map(tool => {
        if (!tool.name) {
            console.warn('[ChatHandler] Warning: Tool missing name:', tool);
        }

        // Sanitize schema: Reconstruction Strategy
        // Instead of copying, we rebuild the schema from scratch with only known-safe fields.
        let safeSchema = {
            type: "object",
            properties: {}
            // Removed 'required' init here to add it only if needed
            // Removed 'additionalProperties' to be less strict/prone to validation errors
        };

        if (tool.input_schema) {
             try {
                 const schema = tool.input_schema;
                 

                 // Rebuild properties
                 if (schema.properties && typeof schema.properties === 'object' && schema.properties !== null) {
                     for (const [key, value] of Object.entries(schema.properties)) {
                         if (value && typeof value === 'object') {
                             // Only copy specific allowed fields for property definition
                             safeSchema.properties[key] = {};
                             if (value.type) safeSchema.properties[key].type = value.type;
                             if (value.description) safeSchema.properties[key].description = value.description;
                             if (value.enum) safeSchema.properties[key].enum = value.enum;
                             // Helper for integer/number constraints
                             if (value.minimum !== undefined) safeSchema.properties[key].minimum = value.minimum;
                             if (value.maximum !== undefined) safeSchema.properties[key].maximum = value.maximum;
                         }
                     }
                 }

                 // Rebuild required only if it has items
                 if (Array.isArray(schema.required) && schema.required.length > 0) {
                     safeSchema.required = [...schema.required];
                 }

             } catch (e) {
                 console.error('[ChatHandler] Error sanitizing tool schema:', e);
                 safeSchema = { type: "object", properties: {} };
             }
        }

        if (isResponsesApi) {
            // Groq Responses API (beta) expects a flat structure
            return {
                type: "function",
                name: tool.name || "unknown_tool",
                description: tool.description || "",
                parameters: safeSchema
            };
        } else {
            // Standard Chat Completions API expects nested function object
            return {
                type: "function",
                function: {
                    name: tool.name || "unknown_tool",
                    description: tool.description || "",
                    parameters: safeSchema
                }
            };
        }
    });
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
        }
        if (settings.builtInTools.browserSearch) {
            builtInTools.push({ type: "browser_search" });
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
        // Tools skipped for compound models
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
    }

    return apiParams;
}

// Processes individual stream chunks for compound-beta and regular models
function processStreamChunk(chunk, event, accumulatedData, groq, streamId, settings) {
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
            const streamInfo = activeStreams.get(streamId);
            if (streamInfo) {
                streamInfo.summaryInterval = null;
            }
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
            // Check if thinking summaries are disabled
            if (!settings?.disableThinkingSummaries) {
                accumulatedData.lastSummarizedTime = Date.now();
                
                // Set up interval to check every 2 seconds
                accumulatedData.summaryInterval = setInterval(() => {
                // Check if stream is still active before triggering summarization
                const currentStreamInfo = activeStreams.get(streamId);
                if (!currentStreamInfo || currentStreamInfo.cancelled) {
                    if (accumulatedData.summaryInterval) {
                        clearInterval(accumulatedData.summaryInterval);
                        accumulatedData.summaryInterval = null;
                    }
                    return;
                }
                
                const now = Date.now();
                const timeSinceLastSummary = now - accumulatedData.lastSummarizedTime;
                
                if (timeSinceLastSummary >= 2000 && accumulatedData.reasoning.length > 0) {
                    accumulatedData.lastSummarizedTime = now;
                    accumulatedData.summaryCount++;
                    
                    // Get the last 300 words for summarization
                    const last300Words = getLastNWords(accumulatedData.reasoning, 300);
                    
                    // Trigger summarization asynchronously (non-blocking)
                    summarizeReasoningChunk(groq, last300Words, event, streamId, accumulatedData.summaryCount)
                        .catch(err => console.error('[Backend] Error in background summarization:', err));
                }
            }, 2000);
            
            // Store interval reference in activeStreams so stopChatStream can clear it
            const streamInfo = activeStreams.get(streamId);
            if (streamInfo) {
                streamInfo.summaryInterval = accumulatedData.summaryInterval;
            }
            }
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

function handleStreamCompletion(event, accumulatedData, finishReason, streamId) {
    // Clear the summary interval if it exists
    if (accumulatedData.summaryInterval) {
        clearInterval(accumulatedData.summaryInterval);
        accumulatedData.summaryInterval = null;
        const streamInfo = activeStreams.get(streamId);
        if (streamInfo) {
            streamInfo.summaryInterval = null;
        }
    }
    
    const completionData = {
        content: accumulatedData.content,
        role: "assistant",
        tool_calls: accumulatedData.toolCalls.length > 0 ? accumulatedData.toolCalls : undefined,
        reasoning: accumulatedData.reasoning || undefined,
        executed_tools: accumulatedData.executedTools.length > 0 ? accumulatedData.executedTools : undefined,
        finish_reason: finishReason,
        usage: accumulatedData.usage
    };
    
    event.sender.send('chat-stream-complete', completionData);
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
        
        // Check if stream is still active before sending results
        const streamInfo = activeStreams.get(streamId);
        if (!streamInfo || streamInfo.cancelled) {
            return;
        }
        
        const summary = response.choices[0]?.message?.content?.trim() || 'Processing thoughts';
        
        // Send the summary to the frontend with streamId and index
        event.sender.send('chat-stream-reasoning-summary', {
            streamId,
            summaryIndex,
            summary
        });
        
        return summary;
    } catch (error) {
        console.error(`[Backend Summary ${summaryIndex}] Error summarizing:`, error.message);
        
        // Check if stream is still active before sending error fallback
        const streamInfo = activeStreams.get(streamId);
        if (!streamInfo || streamInfo.cancelled) {
            return;
        }
        
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
async function executeStreamWithRetry(groq, chatCompletionParams, event, streamId, settings) {
    const MAX_TOOL_USE_RETRIES = 25;
    let retryCount = 0;
    const baseTemperature = chatCompletionParams.temperature;

    while (retryCount <= MAX_TOOL_USE_RETRIES) {
        // Clear any existing interval from previous retry
        const streamInfo = activeStreams.get(streamId);
        if (streamInfo && streamInfo.summaryInterval) {
            clearInterval(streamInfo.summaryInterval);
            streamInfo.summaryInterval = null;
        }
        
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
            if (!streamInfo || streamInfo.cancelled) {
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
                    // Clear summary interval if it exists
                    if (accumulatedData.summaryInterval) {
                        clearInterval(accumulatedData.summaryInterval);
                        accumulatedData.summaryInterval = null;
                        if (currentStreamInfo) {
                            currentStreamInfo.summaryInterval = null;
                        }
                    }
                    event.sender.send('chat-stream-cancelled', { streamId });
                    activeStreams.delete(streamId);
                    return;
                }

                const finishReason = processStreamChunk(chunk, event, accumulatedData, groq, streamId, settings);

                if (finishReason) {
                    handleStreamCompletion(event, accumulatedData, finishReason, streamId);
                    activeStreams.delete(streamId);
                    return;
                }
            }

            // Clear summary interval before exiting
            if (accumulatedData.summaryInterval) {
                clearInterval(accumulatedData.summaryInterval);
                accumulatedData.summaryInterval = null;
                const streamInfo = activeStreams.get(streamId);
                if (streamInfo) {
                    streamInfo.summaryInterval = null;
                }
            }
            
            activeStreams.delete(streamId);
            event.sender.send('chat-stream-error', { error: "Stream ended unexpectedly." });
            return;

        } catch (error) {
            // Check if this was a cancellation
            const streamInfo = activeStreams.get(streamId);
            if (streamInfo && streamInfo.cancelled) {
                // Clear summary interval
                if (accumulatedData.summaryInterval) {
                    clearInterval(accumulatedData.summaryInterval);
                    accumulatedData.summaryInterval = null;
                    if (streamInfo) {
                        streamInfo.summaryInterval = null;
                    }
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
                
                // Bump temperature by 0.05 per retry
                chatCompletionParams.temperature = baseTemperature + (retryCount * 0.05);
                
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
                accumulatedData.summaryInterval = null;
                const currentStreamInfo = activeStreams.get(streamId);
                if (currentStreamInfo) {
                    currentStreamInfo.summaryInterval = null;
                }
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

function handleResponsesApiEvent(data, event, streamId) {
    switch (data.type) {
        case 'response.output_text.delta':
            event.sender.send('chat-stream-content', { content: data.delta });
            break;
        case 'response.output_item.added':
            if (data.item.type === 'mcp_call') {
                event.sender.send('chat-stream-tool-execution', {
                    type: 'start',
                    tool: {
                        index: data.output_index,
                        type: 'function',
                        name: data.item.name,
                        arguments: data.item.arguments || "",
                        server_label: data.item.server_label
                    }
                });
            }
            break;
        case 'response.output_item.done':
            if (data.item.type === 'mcp_call') {
                event.sender.send('chat-stream-tool-execution', {
                    type: 'complete',
                    tool: {
                        index: data.output_index,
                        name: data.item.name,
                        output: data.item.output
                    }
                });
            }
            break;
    }
}

async function handleResponsesApiStream(event, messages, model, settings, modelContextSizes, discoveredTools) {
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        activeStreams.set(streamId, {
            cancelled: false,
            stream: null, 
            event: event,
            summaryInterval: null
        });

        validateApiKey(settings);
        const { modelToUse } = determineModel(model, settings, modelContextSizes);

        // Prepare Connectors
        const tools = [];
        if (settings.googleConnectors?.gmail && settings.googleOAuthToken) {
            tools.push({
                type: "mcp",
                server_label: "gmail",
                connector_id: "connector_gmail",
                authorization: settings.googleOAuthToken,
                require_approval: "never"
            });
        }
        if (settings.googleConnectors?.calendar && settings.googleOAuthToken) {
            tools.push({
                type: "mcp",
                server_label: "google_calendar",
                connector_id: "connector_googlecalendar",
                authorization: settings.googleOAuthToken,
                require_approval: "never"
            });
        }
        if (settings.googleConnectors?.drive && settings.googleOAuthToken) {
            tools.push({
                type: "mcp",
                server_label: "google_drive",
                connector_id: "connector_googledrive",
                authorization: settings.googleOAuthToken,
                require_approval: "never"
            });
        }

        // Add discoveredTools (Client-side tools)
        if (discoveredTools && discoveredTools.length > 0) {
            const clientTools = prepareTools(discoveredTools, true); // true = isResponsesApi
            tools.push(...clientTools);
        }

        // Prepare Input and Instructions
        let instructions = undefined;
        const input = [];
        
        // Helper to find tool output
        const findToolOutput = (id) => messages.find(m => m.role === 'tool' && m.tool_call_id === id);

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            if (msg.role === 'system') {
                instructions = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                continue;
            }

            if (msg.role === 'tool') {
                continue; // Skip, handled via assistant message
            }

            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                // 1. Add text content if present
                let contentText = "";
                if (typeof msg.content === 'string') {
                    contentText = msg.content;
                } else if (Array.isArray(msg.content)) {
                    contentText = msg.content.map(p => p.text || "").join("");
                }
                
                if (contentText) {
                    input.push({
                        role: 'assistant',
                        content: contentText
                    });
                }

                // 2. Add tool calls
                for (const toolCall of msg.tool_calls) {
                    const outputMsg = findToolOutput(toolCall.id);
                    const outputContent = outputMsg ? (typeof outputMsg.content === 'string' ? outputMsg.content : JSON.stringify(outputMsg.content)) : undefined;

                    if (toolCall.server_label) {
                        // MCP Call
                        const mcpItem = {
                            type: "mcp_call",
                            id: toolCall.id, // Use the ID we have
                            name: toolCall.function.name,
                            arguments: toolCall.function.arguments,
                            server_label: toolCall.server_label,
                        };
                        
                        if (outputContent) {
                            mcpItem.status = "completed";
                            mcpItem.output = outputContent;
                        }
                        
                        input.push(mcpItem);
                    } else {
                        // Standard Function Call
                        input.push({
                            type: "function_call",
                            id: toolCall.id,
                            call_id: toolCall.id,
                            name: toolCall.function.name,
                            arguments: toolCall.function.arguments
                        });
                        
                        if (outputContent) {
                            input.push({
                                type: "function_call_output",
                                call_id: toolCall.id,
                                output: outputContent
                            });
                        }
                    }
                }
                continue;
            }

            // Standard message
            let contentText = "";
            if (typeof msg.content === 'string') {
                contentText = msg.content;
            } else if (Array.isArray(msg.content)) {
                contentText = msg.content.map(p => p.text || "").join("");
            }
            
            input.push({
                role: msg.role,
                content: contentText
            });
        }

        const apiParams = {
            model: modelToUse,
            stream: true,
            input: input,
            tools: tools.length > 0 ? tools : undefined,
            instructions: instructions,
            store: false // Groq Responses API does not support stateful conversations yet
        };

        const body = JSON.stringify(apiParams);

        const response = await fetch("https://api.groq.com/openai/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${settings.GROQ_API_KEY}`,
                "Groq-Beta": "inference-metrics"
            },
            body: body
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API Error ${response.status}: ${errText}`);
        }

        event.sender.send('chat-stream-start', {
            id: streamId,
            role: "assistant"
        });

        let accumulatedContent = "";
        let accumulatedReasoning = ""; // Track reasoning
        let buffer = "";
        const stream = response.body;
        
        // Track errors and failures
        const accumulatedData = {
            error: null,
            failed: false,
            failureReason: null
        };
        
        // Store stream for cancellation (if supported by node-fetch/stream)
        // We can't easily abort node-fetch v2 without AbortController (Node 15+)
        // But we can destroy the stream.
        if (activeStreams.get(streamId)) {
            activeStreams.get(streamId).stream = stream;
        }

        const toolCallsMap = new Map(); // id -> toolCall object
        const toolOutputsMap = new Map(); // id -> output

        stream.on('data', (chunk) => {
            if (activeStreams.get(streamId)?.cancelled) {
                stream.destroy(); // Stop stream
                return;
            }
            
            buffer += chunk.toString();
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop(); 
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    if (jsonStr.trim() === '[DONE]') continue;
                    
                    try {
                        const data = JSON.parse(jsonStr);

                        // Inline handling to access accumulators
                        switch (data.type) {
                            case 'error':
                                console.error('[Responses API] Error event received:', data);
                                // Store error for later handling
                                accumulatedData.error = data.error || data.message || 'Unknown error';
                                break;
                                
                            case 'response.failed':
                                console.error('[Responses API] Response failed:', data);
                                // Store failure details
                                accumulatedData.failed = true;
                                accumulatedData.failureReason = data.response?.error?.message || 'Response generation failed';
                                break;
                            
                            case 'response.output_text.delta':
                                accumulatedContent += data.delta;
                                event.sender.send('chat-stream-content', { content: data.delta });
                                break;

                            case 'response.reasoning_text.delta':
                                accumulatedReasoning += data.delta;
                                event.sender.send('chat-stream-reasoning', { 
                                    reasoning: data.delta, 
                                    accumulated: accumulatedReasoning 
                                });
                                break;
                                
                            case 'response.output_item.added':
                                if (data.item.type === 'mcp_call' || data.item.type === 'function_call') {
                                    const toolCall = {
                                        index: data.output_index,
                                        id: data.item.id,
                                        type: 'function',
                                        function: {
                                            name: data.item.name,
                                            arguments: data.item.arguments || ""
                                        },
                                        // Extra fields for UI if needed, but strip for standard history
                                        server_label: data.item.server_label
                                    };
                                    toolCallsMap.set(data.item.id, toolCall);
                                    
                                    // Emit tool execution start for "compound" style UI (optional but good for consistency)
                                    event.sender.send('chat-stream-tool-execution', {
                                        type: 'start',
                                        tool: {
                                            index: data.output_index,
                                            type: 'function',
                                            name: data.item.name,
                                            arguments: data.item.arguments || "",
                                            server_label: data.item.server_label
                                        }
                                    });
                                    
                                    // Emit standard tool calls update
                                    event.sender.send('chat-stream-tool-calls', { 
                                        tool_calls: Array.from(toolCallsMap.values()) 
                                    });
                                }
                                break;
                                
                            case 'response.mcp_call_arguments.delta':
                            case 'response.function_call_arguments.delta':
                                if (toolCallsMap.has(data.item_id)) {
                                    const tc = toolCallsMap.get(data.item_id);
                                    tc.function.arguments += data.delta;
                                    // Update map
                                    toolCallsMap.set(data.item_id, tc);
                                    // Re-emit tool calls
                                    event.sender.send('chat-stream-tool-calls', { 
                                        tool_calls: Array.from(toolCallsMap.values()) 
                                    });
                                } else {
                                    console.warn(`[Responses API] Received delta for unknown tool call: ${data.item_id}`);
                                }
                                break;
                                
                            case 'response.output_item.done':
                                if (data.item.type === 'mcp_call' || data.item.type === 'function_call') {
                                    // Robustness: Ensure tool call exists in map even if 'added' was missed
                                    if (!toolCallsMap.has(data.item.id)) {
                                        toolCallsMap.set(data.item.id, {
                                            index: data.output_index,
                                            id: data.item.id,
                                            type: 'function',
                                            function: {
                                                name: data.item.name,
                                                arguments: data.item.arguments || ""
                                            },
                                            server_label: data.item.server_label
                                        });
                                    }

                                    // Ensure final arguments are set
                                    if (toolCallsMap.has(data.item.id)) {
                                        const tc = toolCallsMap.get(data.item.id);
                                        // Prefer complete arguments from item if available
                                        if (data.item.arguments) {
                                            tc.function.arguments = data.item.arguments;
                                        }
                                        toolCallsMap.set(data.item.id, tc);
                                    }
                                    
                                    // Capture output (only for MCP calls - they return outputs)
                                    if (data.item.output) {
                                        toolOutputsMap.set(data.item.id, data.item.output);
                                        
                                        // Only emit completion event if there's an actual output
                                        // (MCP calls have outputs, client-side function calls don't)
                                        event.sender.send('chat-stream-tool-execution', {
                                            type: 'complete',
                                            tool: {
                                                index: data.output_index,
                                                name: data.item.name,
                                                output: data.item.output
                                            }
                                        });
                                    }
                                    
                                    // Re-emit tool calls (final state)
                                    event.sender.send('chat-stream-tool-calls', { 
                                        tool_calls: Array.from(toolCallsMap.values()) 
                                    });
                                }
                                break;
                        }
                        
                    } catch (e) {
                        console.error('[Responses API] JSON Parse Error:', e);
                        console.error('[Responses API] Bad JSON:', jsonStr);
                    }
                }
            }
        });

        stream.on('end', () => {
             if (!activeStreams.get(streamId)?.cancelled) {
                 // Check for errors or failures first
                 if (accumulatedData.error || accumulatedData.failed) {
                     const errorMessage = accumulatedData.error || accumulatedData.failureReason || 'Response generation failed';
                     console.error('[Responses API] Stream ended with error:', errorMessage);
                     event.sender.send('chat-stream-error', { error: errorMessage });
                     activeStreams.delete(streamId);
                     return;
                 }
                 
                 // Prepare tool responses list (only for MCP calls that returned outputs)
                 const toolResponses = [];
                 toolOutputsMap.forEach((output, id) => {
                     toolResponses.push({
                         tool_call_id: id,
                         content: typeof output === 'string' ? output : JSON.stringify(output)
                     });
                 });

                 // Determine finish_reason:
                 // - If we have tool calls without outputs, it means client needs to execute them -> "tool_calls"
                 // - If we have tool calls with outputs (MCP), they're already done -> "stop"
                 // - If no tool calls, normal completion -> "stop"
                 let finishReason = "stop";
                 if (toolCallsMap.size > 0 && toolOutputsMap.size === 0) {
                     // Client-side tools that need execution
                     finishReason = "tool_calls";
                 }

                 event.sender.send('chat-stream-complete', {
                     content: accumulatedContent,
                     role: "assistant",
                     finish_reason: finishReason,
                     tool_calls: toolCallsMap.size > 0 ? Array.from(toolCallsMap.values()) : undefined,
                     pre_calculated_tool_responses: toolResponses.length > 0 ? toolResponses : undefined,
                     reasoning: accumulatedReasoning || undefined
                 });
                 activeStreams.delete(streamId);
             }
        });
        
        stream.on('error', (err) => {
             if (!activeStreams.get(streamId)?.cancelled) {
                 event.sender.send('chat-stream-error', { error: err.message });
                 activeStreams.delete(streamId);
             }
        });

    } catch (error) {
        activeStreams.delete(streamId);
        event.sender.send('chat-stream-error', { error: error.message });
    }
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
    // Check if Responses API should be used
    if (settings.useResponsesApi) {
        return handleResponsesApiStream(event, messages, model, settings, modelContextSizes, discoveredTools);
    }

    // Generate unique stream ID
    const streamId = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
        // Register this stream as active
        activeStreams.set(streamId, {
            cancelled: false,
            stream: null,
            event: event,
            summaryInterval: null
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
        }
        
        const groq = new Groq(groqConfig);
        
        // Monkey patch the SDK when using custom baseURL
        // Custom baseURL should end with /v1/ (e.g., http://example.com/v1/ or https://api.groq.com/openai/v1/)
        if (settings.customApiBaseUrlEnabled && settings.customApiBaseUrl && settings.customApiBaseUrl.trim()) {
            const originalPost = groq.post.bind(groq);
            const originalBuildURL = groq.buildURL.bind(groq);
            
            // Intercept buildURL to strip /openai/v1/ prefix since custom baseURL includes the full path
            groq.buildURL = function(path, query, defaultBaseURL) {
                // Strip the /openai/v1/ prefix - custom baseURL should include the full path up to /v1/
                if (path.startsWith('/openai/v1/')) {
                    path = path.replace(/^\/openai\/v1/, '');
                }
                return originalBuildURL(path, query, defaultBaseURL);
            };
            
            groq.post = function(path, ...args) {
                return originalPost(path, ...args);
            };
        }
        
        const tools = prepareTools(discoveredTools);
        const cleanedMessages = cleanMessages(messages);
        const prunedMessages = pruneMessageHistory(cleanedMessages, modelToUse, modelContextSizes);
        const chatCompletionParams = buildApiParams(prunedMessages, modelToUse, settings, tools, modelContextSizes);

        await executeStreamWithRetry(groq, chatCompletionParams, event, streamId, settings);
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
            streamInfo.cancelled = true;
            // Clear the summary interval if it exists
            if (streamInfo.summaryInterval) {
                clearInterval(streamInfo.summaryInterval);
                streamInfo.summaryInterval = null;
            }
            // Note: The actual stream interruption happens in the iteration loop
        }
    } else {
        // Stop all active streams
        for (const [id, streamInfo] of activeStreams.entries()) {
            streamInfo.cancelled = true;
            // Clear the summary interval if it exists
            if (streamInfo.summaryInterval) {
                clearInterval(streamInfo.summaryInterval);
                streamInfo.summaryInterval = null;
            }
        }
    }
}

module.exports = { handleChatStream, stopChatStream };
