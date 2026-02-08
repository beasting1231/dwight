import { emailTools, executeEmailTool, initializeEmail, cleanupEmail } from './email/index.js';
import { memoryTools, executeMemoryTool } from './memory/index.js';
import { datetimeTools, executeDatetimeTool } from './datetime/index.js';
import { fileTools, executeFileTool } from './files/index.js';
import { bashTools, executeBashTool } from './bash/index.js';
import { webTools, executeWebTool, isWebConfigured } from './web/index.js';
import { imageTools, executeImageTool, isImageConfigured } from './image/index.js';
import { calendarTools, executeCalendarTool, isCalendarConfigured } from './calendar/index.js';
import { cronTools, executeCronTool, startScheduler, stopScheduler, getSchedulerStatus } from './cron/index.js';

/**
 * All available tools for the AI
 */
export const allTools = [
  ...emailTools,
  ...memoryTools,
  ...datetimeTools,
  ...fileTools,
  ...bashTools,
  ...webTools,
  ...imageTools,
  ...calendarTools,
  ...cronTools,
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
  todo_list: (params) => executeMemoryTool('todo_list', params),
  todo_add: (params) => executeMemoryTool('todo_add', params),
  todo_done: (params) => executeMemoryTool('todo_done', params),
  datetime_now: (params) => executeDatetimeTool('datetime_now', params),
  file_read: (params, ctx) => executeFileTool('file_read', params, ctx),
  file_write: (params, ctx) => executeFileTool('file_write', params, ctx),
  file_edit: (params, ctx) => executeFileTool('file_edit', params, ctx),
  file_list: (params, ctx) => executeFileTool('file_list', params, ctx),
  file_search: (params, ctx) => executeFileTool('file_search', params, ctx),
  file_delete: (params, ctx) => executeFileTool('file_delete', params, ctx),
  file_copy: (params, ctx) => executeFileTool('file_copy', params, ctx),
  file_move: (params, ctx) => executeFileTool('file_move', params, ctx),
  file_info: (params, ctx) => executeFileTool('file_info', params, ctx),
  file_send_photo: (params, ctx) => executeFileTool('file_send_photo', params, ctx),
  bash_run: (params, ctx) => executeBashTool('bash_run', params, ctx),
  bash_pwd: (params, ctx) => executeBashTool('bash_pwd', params, ctx),
  bash_cd: (params, ctx) => executeBashTool('bash_cd', params, ctx),
  web_search: (params) => executeWebTool('web_search', params),
  web_fetch: (params) => executeWebTool('web_fetch', params),
  image_generate: (params, ctx) => executeImageTool('image_generate', params, ctx),
  image_edit: (params, ctx) => executeImageTool('image_edit', params, ctx),
  image_list: (params, ctx) => executeImageTool('image_list', params, ctx),
  calendar_list: (params) => executeCalendarTool('calendar_list', params),
  calendar_create: (params) => executeCalendarTool('calendar_create', params),
  calendar_update: (params) => executeCalendarTool('calendar_update', params),
  calendar_delete: (params) => executeCalendarTool('calendar_delete', params),
  cron_create: (params) => executeCronTool('cron_create', params),
  cron_list: (params) => executeCronTool('cron_list', params),
  cron_get: (params) => executeCronTool('cron_get', params),
  cron_toggle: (params) => executeCronTool('cron_toggle', params),
  cron_delete: (params) => executeCronTool('cron_delete', params),
  cron_update: (params) => executeCronTool('cron_update', params),
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
    web: { success: isWebConfigured() },
    image: { success: isImageConfigured() },
    calendar: { success: isCalendarConfigured() },
  };
  return results;
}

/**
 * Cleanup all tools
 */
export async function cleanupTools() {
  await cleanupEmail();
  stopScheduler();
}

// Re-export scheduler functions for bot.js
export { startScheduler, stopScheduler, getSchedulerStatus };

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
