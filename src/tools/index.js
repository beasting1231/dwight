import { emailTools, executeEmailTool, initializeEmail, cleanupEmail } from './email/index.js';
import { memoryTools, executeMemoryTool } from './memory/index.js';
import { datetimeTools, executeDatetimeTool } from './datetime/index.js';
import { fileTools, executeFileTool } from './files/index.js';

/**
 * All available tools for the AI
 */
export const allTools = [
  ...emailTools,
  ...memoryTools,
  ...datetimeTools,
  ...fileTools,
];

/**
 * Tool executors mapped by name
 */
const toolExecutors = {
  email_list: (params, ctx) => executeEmailTool('email_list', params, ctx),
  email_read: (params, ctx) => executeEmailTool('email_read', params, ctx),
  email_search: (params, ctx) => executeEmailTool('email_search', params, ctx),
  email_draft: (params, ctx) => executeEmailTool('email_draft', params, ctx),
  email_confirm: (params, ctx) => executeEmailTool('email_confirm', params, ctx),
  email_unread_count: (params, ctx) => executeEmailTool('email_unread_count', params, ctx),
  memory_read: (params) => executeMemoryTool('memory_read', params),
  memory_update: (params) => executeMemoryTool('memory_update', params),
  memory_append: (params) => executeMemoryTool('memory_append', params),
  contacts_lookup: (params) => executeMemoryTool('contacts_lookup', params),
  contacts_add: (params) => executeMemoryTool('contacts_add', params),
  contacts_update: (params) => executeMemoryTool('contacts_update', params),
  datetime_now: (params) => executeDatetimeTool('datetime_now', params),
  file_read: (params) => executeFileTool('file_read', params),
  file_write: (params) => executeFileTool('file_write', params),
  file_edit: (params) => executeFileTool('file_edit', params),
  file_list: (params) => executeFileTool('file_list', params),
  file_search: (params) => executeFileTool('file_search', params),
  file_delete: (params) => executeFileTool('file_delete', params),
  file_copy: (params) => executeFileTool('file_copy', params),
  file_move: (params) => executeFileTool('file_move', params),
  file_info: (params) => executeFileTool('file_info', params),
};

// Current chat context for tools that need it
let currentChatId = null;

export function setCurrentChatId(chatId) {
  currentChatId = chatId;
}

/**
 * Execute a tool by name
 */
export async function executeTool(toolName, params) {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return { error: `Unknown tool: ${toolName}` };
  }
  return executor(params, { chatId: currentChatId });
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
