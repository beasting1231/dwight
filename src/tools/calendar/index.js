/**
 * Google Calendar tools for AI
 *
 * Enables the AI to:
 * - List upcoming calendar events
 * - Create new events
 * - Update existing events
 * - Delete events
 */

import { listEvents, createEvent, updateEvent, deleteEvent } from './actions.js';
import { isCalendarConfigured } from './oauth.js';

/**
 * Tool definitions for AI
 */
export const calendarTools = [
  {
    name: 'calendar_list',
    description: `List events from Google Calendar. Use this to check the user's schedule, find upcoming events, or search for specific events.

Returns event details including: id, summary, description, location, start/end times, attendees.

IMPORTANT: Always use datetime_now first to get the current date/time before making calendar queries.`,
    parameters: {
      type: 'object',
      properties: {
        timeMin: {
          type: 'string',
          description: 'Start of time range (ISO 8601 format, e.g., "2024-01-15T00:00:00Z"). Defaults to now.',
        },
        timeMax: {
          type: 'string',
          description: 'End of time range (ISO 8601 format). If not specified, returns events from timeMin onwards.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of events to return (default: 10, max: 250)',
        },
        query: {
          type: 'string',
          description: 'Free text search query to filter events by summary, description, location, etc.',
        },
      },
      required: [],
    },
  },
  {
    name: 'calendar_create',
    description: `Create a new event on Google Calendar. Use this when the user wants to schedule a meeting, appointment, or reminder.

Returns the created event with its ID (needed for updates/deletes).

Tips:
- For all-day events, use date format "YYYY-MM-DD"
- For timed events, use ISO 8601 format or natural language the API can parse
- If no end time given, defaults to 1 hour duration
- Attendees receive email invitations`,
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Event title/summary (required)',
        },
        start: {
          type: 'string',
          description: 'Start date/time. Use "YYYY-MM-DD" for all-day events or ISO 8601 for specific times.',
        },
        end: {
          type: 'string',
          description: 'End date/time. Optional - defaults to 1 hour after start for timed events.',
        },
        description: {
          type: 'string',
          description: 'Event description or notes',
        },
        location: {
          type: 'string',
          description: 'Event location (address or place name)',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of attendee email addresses to invite',
        },
      },
      required: ['summary', 'start'],
    },
  },
  {
    name: 'calendar_update',
    description: `Update an existing calendar event. Use this to modify event details like time, title, or attendees.

You need the event ID from calendar_list to update an event. Only specify fields you want to change.`,
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The event ID to update (from calendar_list)',
        },
        summary: {
          type: 'string',
          description: 'New event title/summary',
        },
        start: {
          type: 'string',
          description: 'New start date/time',
        },
        end: {
          type: 'string',
          description: 'New end date/time',
        },
        description: {
          type: 'string',
          description: 'New event description',
        },
        location: {
          type: 'string',
          description: 'New event location',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Updated list of attendee email addresses (replaces existing)',
        },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'calendar_delete',
    description: `Delete a calendar event. Use this when the user wants to cancel or remove an event.

You need the event ID from calendar_list to delete an event.

WARNING: This action cannot be undone. Confirm with the user before deleting.`,
    parameters: {
      type: 'object',
      properties: {
        eventId: {
          type: 'string',
          description: 'The event ID to delete (from calendar_list)',
        },
      },
      required: ['eventId'],
    },
  },
];

/**
 * Execute a calendar tool
 * @param {string} toolName - Tool name
 * @param {Object} params - Tool parameters
 * @returns {Promise<Object>} - Tool result
 */
export async function executeCalendarTool(toolName, params) {
  // Check if calendar is configured
  if (!isCalendarConfigured()) {
    return {
      error: 'Calendar is not configured. Ask the user to run the "calendar" command in the CLI to set up Google Calendar.',
    };
  }

  try {
    switch (toolName) {
      case 'calendar_list':
        return await listEvents(params);

      case 'calendar_create':
        return await createEvent(params);

      case 'calendar_update':
        return await updateEvent(params);

      case 'calendar_delete':
        return await deleteEvent(params);

      default:
        return { error: `Unknown calendar tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// Re-export for convenience
export { isCalendarConfigured };
export { setupCalendar } from './setup.js';
