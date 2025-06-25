# Autocomplete Setup Guide

The autocomplete feature uses the Groq API to provide intelligent suggestions as you type.

## Quick Setup

1. **Get a Groq API Key**
   - Visit https://console.groq.com/keys
   - Create a free account if you don't have one
   - Generate an API key

2. **Configure the API Key**
   
   **Option A: Using .env file (recommended)**
   ```bash
   # Copy the example file
   cp env.example .env
   
   # Edit .env and replace 'your_groq_api_key_here' with your actual API key
   ```

   **Option B: Using environment variables**
   ```bash
   export GROQ_API_KEY="your_actual_api_key_here"
   ```

3. **Restart the Application**
   - Close Groq Desktop completely
   - Start it again to load the new configuration

## How It Works

- Start typing in the chat input (5+ characters)
- Wait 400ms for the autocomplete suggestion to appear
- Press **Tab** to accept the suggestion
- Press **Escape** to dismiss the suggestion

## Troubleshooting

If autocomplete isn't working:

1. **Check the logs** - Look for `[Autocomplete]` messages in the console
2. **Verify API key** - You should see "GROQ_API_KEY configured: xxxxxxxx..." in the logs
3. **Check your API key** - Make sure it's valid and not expired
4. **Internet connection** - Autocomplete requires internet access to reach the Groq API

## Common Issues

- **No suggestions appearing**: Check if you have a valid API key configured
- **API errors**: Check your API key quotas and limits on the Groq console
- **Too slow**: The feature waits 400ms before making requests to avoid spam

For more help, check the console logs when typing - they will show detailed information about what's happening. 