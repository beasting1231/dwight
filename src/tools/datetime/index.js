/**
 * DateTime tool for getting current date and time
 */

export const datetimeTools = [
  {
    name: 'datetime_now',
    description: 'Get the current date and time. Use this before any task that requires knowing the current time, scheduling, or date-based decisions.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'Timezone to use (e.g., "America/New_York", "Asia/Jakarta"). Defaults to system timezone.',
        },
        format: {
          type: 'string',
          enum: ['full', 'date', 'time'],
          description: 'What to return: full (date + time), date only, or time only. Default: full',
        },
      },
    },
  },
];

/**
 * Execute datetime tool
 */
export async function executeDatetimeTool(toolName, params) {
  if (toolName !== 'datetime_now') {
    return { error: `Unknown datetime tool: ${toolName}` };
  }

  try {
    const now = new Date();
    const timezone = params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const format = params.format || 'full';

    const dateOptions = {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };

    const timeOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    };

    const dateStr = now.toLocaleDateString('en-US', dateOptions);
    const timeStr = now.toLocaleTimeString('en-US', timeOptions);

    let result = {
      timezone: timezone,
      timestamp: now.toISOString(),
    };

    if (format === 'full' || format === 'date') {
      result.date = dateStr;
      result.dayOfWeek = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });
      result.day = now.toLocaleDateString('en-US', { timeZone: timezone, day: 'numeric' });
      result.month = now.toLocaleDateString('en-US', { timeZone: timezone, month: 'long' });
      result.year = now.toLocaleDateString('en-US', { timeZone: timezone, year: 'numeric' });
    }

    if (format === 'full' || format === 'time') {
      result.time = timeStr;
      result.hour = now.toLocaleTimeString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
      result.minute = now.toLocaleTimeString('en-US', { timeZone: timezone, minute: 'numeric' });
    }

    if (format === 'full') {
      result.formatted = `${dateStr} at ${timeStr}`;
    }

    return result;
  } catch (error) {
    return { error: error.message };
  }
}
