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
 * Handles multiple formats:
 *   1. ```tool_code\nbash_run(command='...')\n```
 *   2. tool_code\nbash_run(command='...')
 *   3. tool_code\nprint(default_api.file_list(path = "..."))
 *
 * @param {string} content - The text content from the model
 * @returns {Array} Array of { name, params } objects, empty if none found
 */
function parseTextToolCalls(content) {
  if (!content || typeof content !== 'string') return [];

  const toolCalls = [];
  let remaining = content;

  // Pattern 1: Fenced code blocks ```tool_code\nfunc(...)\n```
  const fencedPattern = /```tool_code\s*\n([a-z_]+)\(([^)]*)\)\s*```/gi;
  let match;
  while ((match = fencedPattern.exec(content)) !== null) {
    const toolName = match[1];
    const argsString = match[2];
    if (!getTool(toolName)) continue;
    const params = parseToolArgs(argsString);
    toolCalls.push({ name: toolName, params });
    remaining = remaining.replace(match[0], '');
  }

  // Pattern 2: Fenced with print(default_api.func(...))
  const fencedApiPattern = /```tool_code\s*\nprint\(default_api\.([a-z_]+)\(([^)]*)\)\)\s*```/gi;
  while ((match = fencedApiPattern.exec(content)) !== null) {
    const toolName = match[1];
    const argsString = match[2];
    if (!getTool(toolName)) continue;
    const params = parseToolArgs(argsString);
    toolCalls.push({ name: toolName, params });
    remaining = remaining.replace(match[0], '');
  }

  // Pattern 3: Plain tool_code\nfunc(...)
  const plainPattern = /tool_code\s*\n([a-z_]+)\(([^)]*)\)/gi;
  while ((match = plainPattern.exec(remaining)) !== null) {
    const toolName = match[1];
    const argsString = match[2];
    if (!getTool(toolName)) continue;
    const params = parseToolArgs(argsString);
    toolCalls.push({ name: toolName, params });
    remaining = remaining.replace(match[0], '');
  }

  // Pattern 4: Plain tool_code\nprint(default_api.func(...))
  const plainApiPattern = /tool_code\s*\nprint\(default_api\.([a-z_]+)\(([^)]*)\)\)/gi;
  while ((match = plainApiPattern.exec(remaining)) !== null) {
    const toolName = match[1];
    const argsString = match[2];
    if (!getTool(toolName)) continue;
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
    // Remove fenced tool_code blocks: ```tool_code\nfunc(...)\n```
    .replace(/```tool_code\s*\n[a-z_]+\([^)]*\)\s*```/gi, '')
    // Remove fenced with default_api: ```tool_code\nprint(default_api.func(...))\n```
    .replace(/```tool_code\s*\nprint\(default_api\.[a-z_]+\([^)]*\)\)\s*```/gi, '')
    // Remove plain tool_code blocks
    .replace(/tool_code\s*\n[a-z_]+\([^)]*\)/gi, '')
    // Remove plain with default_api
    .replace(/tool_code\s*\nprint\(default_api\.[a-z_]+\([^)]*\)\)/gi, '')
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
      'x-api-key': config.ai.apiKey || config.apiKeys?.anthropic,
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
      'Authorization': `Bearer ${config.ai.apiKey || config.apiKeys?.openrouter}`,
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
async function processAnthropicResponse(config, response, history, chatId) {
  const content = response.content;

  // Check if there are tool calls
  const toolUses = content.filter(block => block.type === 'tool_use');

  if (toolUses.length === 0) {
    // No tool calls, return text response
    const textBlock = content.find(block => block.type === 'text');
    return textBlock?.text || '';
  }

  // Restore chat context before executing tools (may have been overwritten by concurrent request)
  setCurrentChatId(chatId);

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
  return processAnthropicResponse(config, followUp, history, chatId);
}

/**
 * Process OpenRouter response and handle tool calls
 */
async function processOpenRouterResponse(config, response, history, chatId) {
  const choice = response.choices?.[0];
  if (!choice || !choice.message) {
    throw new Error('Invalid API response: no choices returned');
  }
  const message = choice.message;

  // Check for native tool calls first
  if (message.tool_calls && message.tool_calls.length > 0) {
    // Add assistant message with tool calls to history
    history.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: message.tool_calls,
    });

    // Restore chat context before executing tools (may have been overwritten by concurrent request)
    setCurrentChatId(chatId);

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
    return processOpenRouterResponse(config, followUp, history, chatId);
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

    // Restore chat context before executing tools
    setCurrentChatId(chatId);

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
    return processOpenRouterResponse(config, followUp, history, chatId);
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
 * Trim history to max messages, ensuring we don't cut in the middle
 * of a tool-call exchange (assistant with tool_calls must be followed
 * by its tool results).
 */
function trimHistory(history, maxMessages = 20) {
  if (history.length <= maxMessages) return;

  let cutIndex = history.length - maxMessages;

  // Walk forward from cutIndex to find a safe boundary —
  // don't start on a 'tool' message or split assistant+tool pairs
  while (cutIndex < history.length) {
    const msg = history[cutIndex];
    // If this is a tool result, we'd be orphaning it — move past it
    if (msg.role === 'tool') {
      cutIndex++;
      continue;
    }
    // If this is a tool_result (Anthropic format), also skip
    if (msg.role === 'user' && Array.isArray(msg.content) &&
        msg.content[0]?.type === 'tool_result') {
      cutIndex++;
      continue;
    }
    break;
  }

  if (cutIndex > 0) {
    history.splice(0, cutIndex);
  }
}

/**
 * Get AI response with optional tool support
 * @param {Object} config - Bot config
 * @param {number} chatId - Chat ID
 * @param {string} userMessage - Text message
 * @param {Object} image - Optional image { base64, mimeType }
 */
export async function getAIResponse(config, chatId, userMessage, image = null) {
  // Set current chat context for tools (scoped per-call for concurrency)
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

  // Trim history safely (won't break tool-call sequences)
  trimHistory(history, 20);

  // Take a snapshot of the history for this API call so concurrent
  // requests to other chats don't mutate our in-flight messages
  const callHistory = [...history];

  const useTools = areToolsEnabled();
  let response;

  if (config.ai.provider === 'anthropic') {
    const result = await callAnthropicAPI(config, callHistory, useTools);
    response = await processAnthropicResponse(config, result, callHistory, chatId);
  } else if (config.ai.provider === 'openrouter') {
    const result = await callOpenRouterAPI(config, callHistory, useTools);
    response = await processOpenRouterResponse(config, result, callHistory, chatId);
  } else {
    throw new Error('No AI provider configured');
  }

  // Sync any tool-call messages that were appended during processing
  // back into the stored history (callHistory may have grown)
  const originalLen = history.length;
  const newMessages = callHistory.slice(originalLen);
  for (const msg of newMessages) {
    history.push(msg);
  }

  // Add final assistant response to history
  history.push({ role: 'assistant', content: response });

  return response;
}
