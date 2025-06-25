const Groq = require('groq-sdk');

/**
 * Generates an autocomplete suggestion based on the provided context.
 *
 * @param {object} options - The options for generating the suggestion.
 * @param {string} options.text - The current text from the input buffer.
 * @param {Array<object>} options.messages - The recent chat message history.
 * @param {string} options.context - The captured context from the active application/clipboard.
 * @param {object} options.settings - The application settings, including the API key.
 * @returns {Promise<string|null>} The autocomplete suggestion string, or null if an error occurs.
 */
async function getAutocompleteSuggestion({ text, messages, context, settings }) {
  console.log('[Autocomplete] Function called with text length:', text?.length || 0);
  
  if (!text || text.length < 5) {
    console.log('[Autocomplete] Skipping - text too short:', text?.length || 0, 'characters');
    return null;
  }

  if (!settings) {
    console.error('[Autocomplete] Error: No settings provided');
    return null;
  }

  if (!settings.GROQ_API_KEY || settings.GROQ_API_KEY === "<replace me>") {
    console.error('[Autocomplete] Error: Groq API key is not configured. Please set GROQ_API_KEY in your .env file or settings.');
    console.error('[Autocomplete] Current API key value:', settings.GROQ_API_KEY);
    return null;
  }

  console.log('[Autocomplete] API key configured, proceeding with request...');
  console.log('[Autocomplete] Input text preview:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
  console.log('[Autocomplete] Messages count:', messages?.length || 0);
  console.log('[Autocomplete] Context provided:', !!context);

  try {
    const groq = new Groq({ apiKey: settings.GROQ_API_KEY });

    // Simplified history: take last 3 messages, keep only user/assistant roles and content
    const recentHistory = (messages || [])
      .slice(-3)
      .map(msg => {
        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          // Extract text from content array
          content = msg.content
            .filter(part => part.type === 'text')
            .map(part => part.text)
            .join(' ');
        } else {
          content = '[complex content]';
        }
        return { role: msg.role, content: content.substring(0, 200) }; // Limit length
      })
      .filter(msg => (msg.role === 'user' || msg.role === 'assistant') && msg.content.length > 0);

    console.log('[Autocomplete] Processed message history:', recentHistory.length, 'messages');

    const systemPrompt = `You are an intelligent autocomplete assistant for a chat application. Your task is to predict what the user will type next.

🚨 ABSOLUTE CRITICAL SPACING REQUIREMENT 🚨
ALWAYS CHECK: Does the user's input end with a space character or not?
- If input ends WITHOUT a space (like "How are") → ALWAYS start your suggestion with a space (like " you doing") 
- If input ends WITH a space (like "I am ") → start suggestion without additional space (like "working on")
- If input ends with partial word (like "func") → continue word without space (like "tion")

WHEN IN DOUBT, ADD THE SPACE! Most inputs will need a space before the suggestion.

Rules:
1. Only output the text that should be APPENDED to complete the user's current input
2. Do not repeat any text the user has already typed
3. Keep completions short and natural (usually 1-10 words)
4. Use context from chat history and screen capture to make relevant suggestions
5. If unsure, provide a common, helpful completion
6. Never include newlines or formatting in your response

MANDATORY EXAMPLES - FOLLOW THESE EXACTLY:
- Input: "How are" → Output: " you doing" (SPACE before "you" because input doesn't end with space)
- Input: "What's the" → Output: " best way" (SPACE before "best" because input doesn't end with space)
- Input: "Can you help" → Output: " me with" (SPACE before "me" because input doesn't end with space)
- Input: "I need to " → Output: "finish this" (NO space before "finish" because input ends with space)
- Input: "func" → Output: "tion" (NO space because continuing the word)
- Input: "Hello wor" → Output: "ld" (NO space because continuing the word)

REMEMBER: 90% of cases need a space at the start of your suggestion! Only omit the space if:
1. The input already ends with a space, OR
2. You're continuing an incomplete word

Provide only the completion text, nothing else.`;

    const userPrompt = `Here is the context for my request:
---
Chat History:
${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}
---
Captured Context:
${context || 'No additional context provided.'}
---
Current Input:
"${text}"
---
Based on all of this, what is the most likely completion for my current input? Remember to only provide the text to append.`;

    console.log('[Autocomplete] Making API request to Groq...');
    
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.1,
      max_tokens: 25,
      stop: ['\n'], // Stop at newlines to keep it a single line suggestion
      stream: false,
    });

    console.log('[Autocomplete] API request completed successfully');
    
    // Don't trim the suggestion to preserve intentional leading/trailing spaces
    const suggestion = chatCompletion.choices[0]?.message?.content || null;
    console.log('[Autocomplete] Raw suggestion from API:', JSON.stringify(suggestion));
    
    // Sometimes the model returns the original text plus the suggestion.
    // We need to remove the original text if it's present.
    let finalSuggestion = suggestion;
    if (suggestion && suggestion.toLowerCase().startsWith(text.toLowerCase())) {
        finalSuggestion = suggestion.substring(text.length);
        console.log('[Autocomplete] Removed duplicate text, final suggestion:', JSON.stringify(finalSuggestion));
    }

    // Defensive logic: ensure proper spacing for new words
    if (finalSuggestion && finalSuggestion.length > 0) {
      // Check if user's text ends with a non-whitespace character and suggestion doesn't start with space
      const endsWithNonSpace = text && /\S$/.test(text);
      const startsWithoutSpace = !finalSuggestion.startsWith(' ');
      const isNewWord = finalSuggestion.match(/^[a-zA-Z]/); // Starts with a letter (likely new word)
      
      // If text ends without space, suggestion starts without space, and it's a new word, add space
      if (endsWithNonSpace && startsWithoutSpace && isNewWord) {
        finalSuggestion = ' ' + finalSuggestion;
        console.log('[Autocomplete] Added defensive space for new word, final suggestion:', JSON.stringify(finalSuggestion));
      }
    }

    console.log('[Autocomplete] Returning suggestion:', JSON.stringify(finalSuggestion));
    return finalSuggestion;

  } catch (error) {
    console.error('[Autocomplete] Error getting suggestion from Groq API:', error.message);
    console.error('[Autocomplete] Full error details:', error);
    return null;
  }
}

module.exports = { getAutocompleteSuggestion }; 