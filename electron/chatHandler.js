const Groq = require('groq-sdk');
const { pruneMessageHistory } = require('./messageUtils'); // Import pruning logic

/**
 * Handles the 'chat-stream' IPC event for streaming chat completions.
 *
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {Array<object>} messages - The array of message objects for the chat history.
 * @param {string} model - The specific model requested for this completion.
 * @param {object} settings - The current application settings.
 * @param {object} modelContextSizes - Object containing context window sizes for models.
 * @param {Array<object>} discoveredTools - List of available MCP tools.
 */
async function handleChatStream(event, messages, model, settings, modelContextSizes, discoveredTools) {
    console.log(`Handling chat-stream request. Model: ${model || 'using settings'}, Messages: ${messages?.length}`);

    try {
        // Validate API Key
        if (!settings.GROQ_API_KEY || settings.GROQ_API_KEY === "<replace me>") {
            event.sender.send('chat-stream-error', { error: "API key not configured. Please add your GROQ API key in settings." });
            return;
        }

        // Determine model to use: prioritise argument, then settings, then fallback
        const modelToUse = model || settings.model || "llama-3.3-70b-versatile";
        const modelInfo = modelContextSizes[modelToUse] || modelContextSizes['default'] || { context: 8192, vision_supported: false }; // Ensure default exists
        console.log(`Using model: ${modelToUse} (Context: ${modelInfo.context}, Vision: ${modelInfo.vision_supported})`);

        // Check for vision support if images are present
        const hasImages = messages.some(msg =>
            msg.role === 'user' &&
            Array.isArray(msg.content) &&
            msg.content.some(part => part.type === 'image_url')
        );

        if (hasImages && !modelInfo.vision_supported) {
            console.warn(`Attempting to use images with non-vision model: ${modelToUse}`);
            event.sender.send('chat-stream-error', { error: `The selected model (${modelToUse}) does not support image inputs. Please select a vision-capable model.` });
            return;
        }

        // Initialize Groq SDK
        const groq = new Groq({ apiKey: settings.GROQ_API_KEY });

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

        // Clean and prepare messages for the API
        // 1. Remove internal fields like 'reasoning', 'isStreaming'
        // 2. Ensure correct content format (user: array, assistant: string, tool: string)
        const cleanedMessages = messages.map(msg => {
            // Create a clean copy, then delete unwanted properties
            const cleanMsg = { ...msg };
            delete cleanMsg.reasoning;
            delete cleanMsg.isStreaming;
            let finalMsg = { ...cleanMsg };

            // Ensure user message content is an array of parts
            if (finalMsg.role === 'user') {
                if (typeof finalMsg.content === 'string') {
                    finalMsg.content = [{ type: 'text', text: finalMsg.content }];
                } else if (!Array.isArray(finalMsg.content)) {
                    // Handle unexpected format - log and default to empty text
                    console.warn('Unexpected user message content format, defaulting:', finalMsg.content);
                    finalMsg.content = [{ type: 'text', text: '' }];
                }
                // Ensure all parts have a type
                finalMsg.content = finalMsg.content.map(part => ({ type: part.type || 'text', ...part }));
            }

            // Ensure assistant message content is a string
            if (finalMsg.role === 'assistant' && typeof finalMsg.content !== 'string') {
                 if (Array.isArray(finalMsg.content)) {
                     // Extract text from parts if it's an array
                     const textContent = finalMsg.content.filter(p => p.type === 'text').map(p => p.text).join('');
                     finalMsg.content = textContent;
                 } else {
                     // Attempt to stringify other non-string formats, log warning
                     console.warn('Unexpected assistant message content format, attempting stringify:', finalMsg.content);
                     try {
                         finalMsg.content = JSON.stringify(finalMsg.content);
                     } catch { finalMsg.content = '[Non-string content]'; }
                 }
            }

            // Ensure tool message content is stringified if not already
            if (finalMsg.role === 'tool' && typeof finalMsg.content !== 'string') {
                try {
                    finalMsg.content = JSON.stringify(finalMsg.content);
                } catch (e) {
                    console.warn("Could not stringify tool content:", finalMsg.content, "Error:", e);
                    finalMsg.content = "[Error stringifying tool content]";
                }
            }
            return finalMsg;
        });

        // Prune message history (includes image filtering logic)
        const prunedMessages = pruneMessageHistory(cleanedMessages, modelToUse, modelContextSizes);
        console.log(`History pruned: ${cleanedMessages.length} -> ${prunedMessages.length} messages.`);

        // Construct the system prompt
        let systemPrompt = "You are a helpful assistant capable of using tools. Use tools only when necessary and relevant to the user's request. Format responses using Markdown.";
        if (settings.customSystemPrompt && settings.customSystemPrompt.trim()) {
            systemPrompt += `\n\n${settings.customSystemPrompt.trim()}`;
            console.log("Appending custom system prompt.");
        }

        // Prepare API parameters
        const chatCompletionParams = {
            messages: [
                { role: "system", content: systemPrompt }, // Use the constructed system prompt
                ...prunedMessages // Use the pruned history
            ],
            model: modelToUse,
            temperature: settings.temperature ?? 0.7, // Use nullish coalescing for defaults
            top_p: settings.top_p ?? 0.95,
            ...(tools.length > 0 && { tools: tools, tool_choice: "auto" }),
            stream: true
        };

        // Add reasoning format if supported (adjust keywords as needed)
        // if (modelToUse.includes("qwq") || modelToUse.includes("r1")) {
        //     chatCompletionParams.reasoning_format = "parsed";
        // }

        // --- Streaming and Retry Logic --- (Moved inside try block)
        let retryCount = 0;
        const MAX_TOOL_USE_RETRIES = 3; // Slightly reduced retries

        while (retryCount <= MAX_TOOL_USE_RETRIES) {
            try {
                let accumulatedContent = "";
                let accumulatedToolCalls = [];
                let accumulatedReasoning = null; // Store reasoning if applicable
                let isFirstChunk = true;
                let streamId = null;

                console.log(`Attempting Groq completion (attempt ${retryCount + 1}/${MAX_TOOL_USE_RETRIES + 1})...`);
                const stream = await groq.chat.completions.create(chatCompletionParams);

                for await (const chunk of stream) {
                    if (!chunk.choices || !chunk.choices.length || !chunk.choices[0]) continue;

                    const choice = chunk.choices[0];
                    const delta = choice.delta;

                    if (isFirstChunk) {
                        streamId = chunk.id; // Capture stream ID
                        event.sender.send('chat-stream-start', {
                            id: streamId,
                            role: delta?.role || "assistant"
                        });
                        isFirstChunk = false;
                    }

                    // Accumulate content
                    if (delta?.content) {
                        accumulatedContent += delta.content;
                        event.sender.send('chat-stream-content', { content: delta.content });
                    }

                     // Accumulate reasoning (example)
                    // if (delta?.reasoning) { ... }

                    // Accumulate and process tool calls
                    if (delta?.tool_calls && delta.tool_calls.length > 0) {
                        for (const toolCallDelta of delta.tool_calls) {
                            let existingCall = accumulatedToolCalls.find(tc => tc.index === toolCallDelta.index);

                            if (!existingCall) {
                                // Start of a new tool call
                                accumulatedToolCalls.push({
                                    index: toolCallDelta.index,
                                    id: toolCallDelta.id || `tool_${Date.now()}_${toolCallDelta.index}`, // Generate ID if missing
                                    type: toolCallDelta.type || 'function',
                                    function: {
                                        name: toolCallDelta.function?.name || "",
                                        arguments: toolCallDelta.function?.arguments || ""
                                    }
                                });
                            } else {
                                // Append to existing tool call arguments
                                if (toolCallDelta.function?.arguments) {
                                    existingCall.function.arguments += toolCallDelta.function.arguments;
                                }
                                // Update name if provided incrementally (less common)
                                if (toolCallDelta.function?.name) {
                                    existingCall.function.name = toolCallDelta.function.name;
                                }
                                // Update id if provided later
                                if (toolCallDelta.id) {
                                    existingCall.id = toolCallDelta.id;
                                }
                            }
                        }
                        // Send update with potentially partial tool calls
                        event.sender.send('chat-stream-tool-calls', { tool_calls: accumulatedToolCalls });
                    }

                    // Handle stream completion
                    if (choice.finish_reason) {
                        console.log(`Stream completed. Reason: ${choice.finish_reason}, ID: ${streamId}`);
                        event.sender.send('chat-stream-complete', {
                            content: accumulatedContent,
                            role: "assistant",
                            tool_calls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
                            reasoning: accumulatedReasoning, // Send accumulated reasoning
                            finish_reason: choice.finish_reason
                        });
                        return; // Exit function successfully after completion
                    }
                }
                // If loop finishes without finish_reason (should not happen with Groq stream)
                console.warn("Stream ended unexpectedly without a finish_reason.");
                event.sender.send('chat-stream-error', { error: "Stream ended unexpectedly." });
                return;

            } catch (error) {
                // Check for tool_use_failed specifically
                const isToolUseFailedError =
                    error?.error?.code === 'tool_use_failed' ||
                    (error?.message && error.message.includes('tool_use_failed'));

                if (isToolUseFailedError && retryCount < MAX_TOOL_USE_RETRIES) {
                    retryCount++;
                    console.warn(`Tool use failed error encountered. Retrying (${retryCount}/${MAX_TOOL_USE_RETRIES})...`);
                    // Optional: Add a small delay before retrying?
                    // await new Promise(resolve => setTimeout(resolve, 500));
                    continue; // Go to the next iteration of the while loop
                }

                // Handle other errors or exhausted retries
                console.error('Error during Groq stream processing:', error);
                // Provide more context in the error message sent to the client
                const errorMessage = error instanceof Error ? error.message : String(error);
                event.sender.send('chat-stream-error', {
                     error: `Failed to get chat completion: ${errorMessage}`,
                     details: error // Send the full error object if needed for frontend debugging
                });
                return; // Exit function after sending error
            }
        }

         // If retries are exhausted for tool_use_failed
         if (retryCount > MAX_TOOL_USE_RETRIES) {
             console.error(`Max retries (${MAX_TOOL_USE_RETRIES}) exceeded for tool_use_failed error.`);
             event.sender.send('chat-stream-error', { error: `The model repeatedly failed to use tools correctly after ${MAX_TOOL_USE_RETRIES + 1} attempts. Please try rephrasing your request.` });
         }

    } catch (outerError) {
        // Catch errors during setup (e.g., SDK init, message prep)
        console.error('Error setting up chat completion stream:', outerError);
        event.sender.send('chat-stream-error', { error: `Setup error: ${outerError.message}` });
    }
}

module.exports = {
    handleChatStream
}; 