import { conversations } from './state.js';
import { allTools, executeTool, formatToolsForAI, setCurrentChatId, getTool } from './tools/index.js';
import { loadConfig } from './config.js';
import { logToolCall } from './ui.js';
import { buildSystemPromptWithMemory } from './tools/memory/index.js';

/**
 * Check if tools are enabled (email configured)
 */
function areToolsEnabled() {
  const config = loadConfig();
  return config?.email?.enabled === true;
}

/**
 * Parse text-based tool calls from model output
 * Handles formats like:
 *   ```tool_code
 *   bash_run(command='mkdir ~/projects')
 *   ```
 * or just:
 *   tool_code
 *   bash_run(command='...')
 *
 * @param {string} content - The text content from the model
 * @returns {Array} Array of { name, params } objects, empty if none found
 */
function parseTextToolCalls(content) {
  if (!content || typeof content !== 'string') return [];

  const toolCalls = [];
  let remaining = content;

  // First, extract fenced code blocks: ```tool_code\nfunc(...)\n```
  const fencedPattern = /```tool_code\s*\n([a-z_]+)\(([^)]*)\)\s*```/gi;
  let match;
  while ((match = fencedPattern.exec(content)) !== null) {
    const toolName = match[1];
    const argsString = match[2];

    // Verify this is a real tool
    if (!getTool(toolName)) continue;

    // Parse the arguments
    const params = parseToolArgs(argsString);
    toolCalls.push({ name: toolName, params });

    // Remove this match from remaining content
    remaining = remaining.replace(match[0], '');
  }

  // Then check for plain text: tool_code\nfunc(...)
  const plainPattern = /tool_code\s*\n([a-z_]+)\(([^)]*)\)/gi;
  while ((match = plainPattern.exec(remaining)) !== null) {
    const toolName = match[1];
    const argsString = match[2];

    // Verify this is a real tool
    if (!getTool(toolName)) continue;

    // Parse the arguments
    const params = parseToolArgs(argsString);
    toolCalls.push({ name: toolName, params });
  }

  return toolCalls;
}

/**
 * Parse tool arguments from string format: key='value', key2='value2'
 */
function parseToolArgs(argsString) {
  const params = {};
  const argPattern = /(\w+)\s*=\s*['"]([^'"]*)['"]/g;
  let argMatch;
  while ((argMatch = argPattern.exec(argsString)) !== null) {
    params[argMatch[1]] = argMatch[2];
  }
  return params;
}

/**
 * Remove text-based tool call blocks from content
 * @param {string} content - The text content
 * @returns {string} Content with tool blocks removed
 */
function stripTextToolCalls(content) {
  if (!content || typeof content !== 'string') return content;

  return content
    // Remove markdown fenced tool_code blocks
    .replace(/```tool_code\s*\n[a-z_]+\([^)]*\)\s*```/gi, '')
    // Remove plain tool_code blocks
    .replace(/tool_code\s*\n[a-z_]+\([^)]*\)/gi, '')
    .trim();
}

/**
 * Call Anthropic API
 */
async function callAnthropicAPI(config, messages, useTools = false) {
  const basePrompt = config.ai.systemPrompt || 'You are Dwight, a helpful AI assistant.';
  const systemPrompt = buildSystemPromptWithMemory(basePrompt);

  const body = {
    model: config.ai.model,
    max_tokens: config.ai.maxTokens || 4096,
    system: systemPrompt,
    messages: messages,
  };

  // Add tools if enabled
  if (useTools && areToolsEnabled()) {
    body.tools = formatToolsForAI('anthropic');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ai.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Call OpenRouter API
 */
async function callOpenRouterAPI(config, messages, useTools = false) {
  const basePrompt = config.ai.systemPrompt || 'You are Dwight, a helpful AI assistant.';
  const systemPrompt = buildSystemPromptWithMemory(basePrompt);

  const body = {
    model: config.ai.model,
    max_tokens: config.ai.maxTokens || 4096,
    temperature: config.ai.temperature || 0.7,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  };

  // Add tools if enabled
  if (useTools && areToolsEnabled()) {
    body.tools = formatToolsForAI('openrouter');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.ai.apiKey}`,
      'HTTP-Referer': 'https://github.com/dwight-bot',
      'X-Title': 'Dwight Telegram Bot',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Process Anthropic response and handle tool calls
 */
async function processAnthropicResponse(config, response, history) {
  const content = response.content;

  // Check if there are tool calls
  const toolUses = content.filter(block => block.type === 'tool_use');

  if (toolUses.length === 0) {
    // No tool calls, return text response
    const textBlock = content.find(block => block.type === 'text');
    return textBlock?.text || '';
  }

  // Execute tools
  const toolResults = [];
  for (const toolUse of toolUses) {
    logToolCall(toolUse.name, 'running', toolUse.input);
    const result = await executeTool(toolUse.name, toolUse.input);
    logToolCall(toolUse.name, result.error ? 'error' : 'success', toolUse.input);
    toolResults.push({
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: JSON.stringify(result),
    });
  }

  // Add assistant message with tool use to history
  history.push({ role: 'assistant', content: content });

  // Add tool results to history
  history.push({ role: 'user', content: toolResults });

  // Call API again to get final response
  const followUp = await callAnthropicAPI(config, history, true);
  return processAnthropicResponse(config, followUp, history);
}

/**
 * Process OpenRouter response and handle tool calls
 */
async function processOpenRouterResponse(config, response, history) {
  const choice = response.choices[0];
  const message = choice.message;

  // Check for native tool calls first
  if (message.tool_calls && message.tool_calls.length > 0) {
    // Add assistant message with tool calls to history
    history.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: message.tool_calls,
    });

    // Execute tools and add results
    for (const toolCall of message.tool_calls) {
      const toolParams = JSON.parse(toolCall.function.arguments);
      logToolCall(toolCall.function.name, 'running', toolParams);
      const result = await executeTool(toolCall.function.name, toolParams);
      logToolCall(toolCall.function.name, result.error ? 'error' : 'success', toolParams);

      history.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }

    // Call API again to get final response
    const followUp = await callOpenRouterAPI(config, history, true);
    return processOpenRouterResponse(config, followUp, history);
  }

  // Check for text-based tool calls (Gemini often outputs these instead)
  const textToolCalls = parseTextToolCalls(message.content);
  if (textToolCalls.length > 0) {
    // Strip the tool call text from the message for history
    const cleanContent = stripTextToolCalls(message.content);

    // Build fake tool_calls array for history compatibility
    const fakeToolCalls = textToolCalls.map((tc, i) => ({
      id: `text_tool_${Date.now()}_${i}`,
      type: 'function',
      function: { name: tc.name, arguments: JSON.stringify(tc.params) },
    }));

    // Add assistant message to history
    history.push({
      role: 'assistant',
      content: cleanContent,
      tool_calls: fakeToolCalls,
    });

    // Execute tools and add results
    for (let i = 0; i < textToolCalls.length; i++) {
      const tc = textToolCalls[i];
      logToolCall(tc.name, 'running', tc.params);
      const result = await executeTool(tc.name, tc.params);
      logToolCall(tc.name, result.error ? 'error' : 'success', tc.params);

      history.push({
        role: 'tool',
        tool_call_id: fakeToolCalls[i].id,
        content: JSON.stringify(result),
      });
    }

    // Call API again to get final response
    const followUp = await callOpenRouterAPI(config, history, true);
    return processOpenRouterResponse(config, followUp, history);
  }

  // No tool calls, return content
  return message.content || '';
}

/**
 * Format message content for vision (with image)
 * @param {string} text - Text message
 * @param {Object} image - Optional image { base64, mimeType }
 * @param {string} provider - 'anthropic' or 'openrouter'
 * @returns {string|Array} Formatted content
 */
function formatMessageContent(text, image, provider) {
  if (!image) {
    return text || '';
  }

  if (provider === 'anthropic') {
    const content = [];
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: image.mimeType,
        data: image.base64,
      },
    });
    if (text) {
      content.push({ type: 'text', text });
    }
    return content;
  }

  // OpenRouter / OpenAI format
  const content = [];
  content.push({
    type: 'image_url',
    image_url: {
      url: `data:${image.mimeType};base64,${image.base64}`,
    },
  });
  if (text) {
    content.push({ type: 'text', text });
  }
  return content;
}

/**
 * Get AI response with optional tool support
 * @param {Object} config - Bot config
 * @param {number} chatId - Chat ID
 * @param {string} userMessage - Text message
 * @param {Object} image - Optional image { base64, mimeType }
 */
export async function getAIResponse(config, chatId, userMessage, image = null) {
  // Set current chat context for tools
  setCurrentChatId(chatId);

  // Get or create conversation history
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }
  const history = conversations.get(chatId);

  // Format message content (with or without image)
  const content = formatMessageContent(userMessage, image, config.ai.provider);

  // Add user message to history
  history.push({ role: 'user', content });

  // Keep only last 20 messages to avoid token limits
  if (history.length > 20) {
    history.splice(0, history.length - 20);
  }

  const useTools = areToolsEnabled();
  let response;

  if (config.ai.provider === 'anthropic') {
    const result = await callAnthropicAPI(config, history, useTools);
    response = await processAnthropicResponse(config, result, history);
  } else if (config.ai.provider === 'openrouter') {
    const result = await callOpenRouterAPI(config, history, useTools);
    response = await processOpenRouterResponse(config, result, history);
  } else {
    throw new Error('No AI provider configured');
  }

  // Add final assistant response to history
  history.push({ role: 'assistant', content: response });

  return response;
}
