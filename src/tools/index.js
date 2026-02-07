import { emailTools, executeEmailTool, initializeEmail, cleanupEmail } from './email/index.js';
import { memoryTools, executeMemoryTool } from './memory/index.js';
import { datetimeTools, executeDatetimeTool } from './datetime/index.js';

/**
 * All available tools for the AI
 */
export const allTools = [
  ...emailTools,
  ...memoryTools,
  ...datetimeTools,
];

/**
 * Tool executors mapped by name
 */
const toolExecutors = {
  email_list: (params) => executeEmailTool('email_list', params),
  email_read: (params) => executeEmailTool('email_read', params),
  email_search: (params) => executeEmailTool('email_search', params),
  email_send: (params) => executeEmailTool('email_send', params),
  email_unread_count: (params) => executeEmailTool('email_unread_count', params),
  memory_read: (params) => executeMemoryTool('memory_read', params),
  memory_update: (params) => executeMemoryTool('memory_update', params),
  memory_append: (params) => executeMemoryTool('memory_append', params),
  datetime_now: (params) => executeDatetimeTool('datetime_now', params),
};

/**
 * Execute a tool by name
 */
export async function executeTool(toolName, params) {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return { error: `Unknown tool: ${toolName}` };
  }
  return executor(params);
}

/**
 * Get tool definition by name
 */
export function getTool(toolName) {
  return allTools.find(t => t.name === toolName);
}

/**
 * Get all tools for a specific category
 */
export function getToolsByCategory(category) {
  const categoryPrefix = `${category}_`;
  return allTools.filter(t => t.name.startsWith(categoryPrefix));
}

/**
 * Initialize all tools
 */
export async function initializeTools() {
  const results = {
    email: await initializeEmail(),
  };
  return results;
}

/**
 * Cleanup all tools
 */
export async function cleanupTools() {
  await cleanupEmail();
}

/**
 * Format tools for AI provider
 * Returns tools in the format expected by the AI API
 */
export function formatToolsForAI(provider) {
  if (provider === 'anthropic') {
    return allTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }));
  }

  // OpenRouter / OpenAI format
  return allTools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
