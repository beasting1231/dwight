/**
 * Cron tools for AI
 *
 * Enables the AI to:
 * - Create scheduled tasks (one-time or recurring)
 * - List, view, and manage cron jobs
 * - Execute prompts at specified times
 */

import { createCron, listCrons, getCron, toggleCron, removeCron, editCron } from './actions.js';
export { startScheduler, stopScheduler, getSchedulerStatus } from './scheduler.js';
export { getDueCrons, getMissedCrons, markExecuted } from './actions.js';

/**
 * Tool definitions for AI
 */
export const cronTools = [
  {
    name: 'cron_create',
    description: `Create a scheduled task (cron job) that will execute at specified times.

CRITICAL DISTINCTION - Read this carefully:
• "IN X minutes/hours" = ONE-TIME = type: "once" (e.g., "remind me IN 5 minutes")
• "EVERY X minutes/hours" = RECURRING = type: "interval" (e.g., "EVERY 5 minutes")

IMPORTANT: For ONE-TIME reminders (e.g., "in 5 minutes", "in 1 minute", "tomorrow at 3pm", "next Tuesday"),
ALWAYS use type: "once" with a specific datetime. The task auto-deletes after running.

For RECURRING tasks (e.g., "every day", "every Monday", "every 2 hours"), use other types.

Pattern types:
- once: Run ONCE at a specific date/time, then auto-delete (USE FOR REMINDERS)
- daily: Run every day at a specific time (RECURRING)
- weekly: Run on specific days of the week (RECURRING)
- monthly: Run on a specific day of the month (RECURRING)
- interval: Run every N hours or minutes (RECURRING - NOT for one-time reminders!)

Correct examples:
- "Remind me in 5 minutes" → { type: "once", datetime: "2026-02-08T22:37:00Z" }
- "Remind me in 1 minute" → { type: "once", datetime: "2026-02-08T22:33:00Z" }
- "In 30 minutes, check email" → { type: "once", datetime: "2026-02-08T23:02:00Z" }
- "Remind me tomorrow at 8am" → { type: "once", datetime: "2026-02-09T08:00:00" }
- "Every day at 9am" → { type: "daily", time: "09:00" }
- "Every Monday and Friday at 2pm" → { type: "weekly", days: ["monday", "friday"], time: "14:00" }
- "Every 4 hours" → { type: "interval", hours: 4 }

WRONG examples (DO NOT DO THIS):
- "Remind me in 5 minutes" → { type: "interval", minutes: 5 } ❌ WRONG!
- "In 1 minute" → { type: "interval", minutes: 1 } ❌ WRONG! Use type: "once"!`,
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'A short description of what this cron does (e.g., "Send weekly report email")',
        },
        prompt: {
          type: 'string',
          description: 'The prompt/instruction to execute when the cron runs. This will be processed as if the user sent it.',
        },
        pattern: {
          type: 'object',
          description: 'When to run this cron',
          properties: {
            type: {
              type: 'string',
              enum: ['once', 'daily', 'weekly', 'monthly', 'interval'],
              description: 'The type of schedule',
            },
            datetime: {
              type: 'string',
              description: 'For "once": ISO datetime string (e.g., "2026-02-09T08:00:00")',
            },
            time: {
              type: 'string',
              description: 'For daily/weekly/monthly: Time in HH:MM format (e.g., "09:00", "14:30")',
            },
            days: {
              type: 'array',
              items: { type: 'string' },
              description: 'For "weekly": Array of day names (e.g., ["monday", "wednesday", "friday"])',
            },
            dayOfMonth: {
              type: 'number',
              description: 'For "monthly" by date: Day of month (1-31)',
            },
            weekday: {
              type: 'string',
              description: 'For "monthly" by weekday: Day name (e.g., "thursday")',
            },
            occurrence: {
              type: 'number',
              description: 'For "monthly" by weekday: Which occurrence (1=first, 2=second, etc.)',
            },
            hours: {
              type: 'number',
              description: 'For "interval" (recurring): Number of hours between runs. NOT for one-time reminders!',
            },
            minutes: {
              type: 'number',
              description: 'For "interval" (recurring): Number of minutes between runs. NOT for one-time reminders!',
            },
          },
          required: ['type'],
        },
      },
      required: ['description', 'prompt', 'pattern'],
    },
  },
  {
    name: 'cron_list',
    description: 'List all scheduled cron jobs with their status and next run times.',
    parameters: {
      type: 'object',
      properties: {
        enabledOnly: {
          type: 'boolean',
          description: 'If true, only show enabled crons (default: false)',
        },
      },
    },
  },
  {
    name: 'cron_get',
    description: 'Get detailed information about a specific cron job including its prompt.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The cron job ID',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'cron_toggle',
    description: 'Enable or disable a cron job.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The cron job ID',
        },
        enabled: {
          type: 'boolean',
          description: 'Set to true to enable, false to disable. Omit to toggle.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'cron_delete',
    description: 'Delete a cron job permanently.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The cron job ID to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'cron_update',
    description: 'Update an existing cron job (description, prompt, or schedule).',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The cron job ID to update',
        },
        description: {
          type: 'string',
          description: 'New description (optional)',
        },
        prompt: {
          type: 'string',
          description: 'New prompt to execute (optional)',
        },
        pattern: {
          type: 'object',
          description: 'New schedule pattern (optional)',
        },
      },
      required: ['id'],
    },
  },
];

/**
 * Execute a cron tool
 * @param {string} toolName - Tool name
 * @param {Object} params - Tool parameters
 * @returns {Promise<Object>} - Tool result
 */
export async function executeCronTool(toolName, params) {
  try {
    switch (toolName) {
      case 'cron_create':
        return await createCron(params);
      case 'cron_list':
        return await listCrons(params);
      case 'cron_get':
        return await getCron(params);
      case 'cron_toggle':
        return await toggleCron(params);
      case 'cron_delete':
        return await removeCron(params);
      case 'cron_update':
        return await editCron(params);
      default:
        return { error: `Unknown cron tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}
