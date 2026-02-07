import { conversations } from './state.js';
import { allTools, executeTool, formatToolsForAI } from './tools/index.js';
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
    logToolCall(toolUse.name, 'running');
    const result = await executeTool(toolUse.name, toolUse.input);
    logToolCall(toolUse.name, result.error ? 'error' : 'success');
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

  // Check for tool calls
  if (message.tool_calls && message.tool_calls.length > 0) {
    // Add assistant message with tool calls to history
    history.push({
      role: 'assistant',
      content: message.content || '',
      tool_calls: message.tool_calls,
    });

    // Execute tools and add results
    for (const toolCall of message.tool_calls) {
      logToolCall(toolCall.function.name, 'running');
      const result = await executeTool(
        toolCall.function.name,
        JSON.parse(toolCall.function.arguments)
      );
      logToolCall(toolCall.function.name, result.error ? 'error' : 'success');

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

  // No tool calls, return content
  return message.content || '';
}

/**
 * Get AI response with optional tool support
 */
export async function getAIResponse(config, chatId, userMessage) {
  // Get or create conversation history
  if (!conversations.has(chatId)) {
    conversations.set(chatId, []);
  }
  const history = conversations.get(chatId);

  // Add user message to history
  history.push({ role: 'user', content: userMessage });

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
