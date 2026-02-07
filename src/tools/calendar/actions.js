/**
 * Calendar action implementations
 * CRUD operations for Google Calendar events
 */

import * as client from './client.js';
import { isCalendarConfigured } from './oauth.js';

/**
 * Format an event for AI-friendly output
 * @param {Object} event - Google Calendar event
 * @returns {Object} - Simplified event object
 */
function formatEvent(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const isAllDay = !event.start?.dateTime;

  return {
    id: event.id,
    summary: event.summary || '(No title)',
    description: event.description || null,
    location: event.location || null,
    start,
    end,
    isAllDay,
    status: event.status,
    htmlLink: event.htmlLink,
    attendees: event.attendees?.map(a => ({
      email: a.email,
      name: a.displayName || null,
      responseStatus: a.responseStatus,
    })) || [],
    creator: event.creator?.email || null,
    organizer: event.organizer?.email || null,
  };
}

/**
 * Parse a date/time string into ISO format
 * Handles various formats like "tomorrow at 2pm", "2024-01-15 14:00"
 * @param {string} dateStr - Date string to parse
 * @param {boolean} isEnd - If true, defaults to end of day for date-only inputs
 * @returns {string} - ISO date string
 */
function parseDateTime(dateStr, isEnd = false) {
  // If already ISO format, return as-is
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
    return dateStr;
  }

  // If just a date (YYYY-MM-DD), return as-is for all-day events
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse with Date constructor
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  }

  // Return original string and let Google API handle it or error
  return dateStr;
}

/**
 * List calendar events
 * @param {Object} params - List parameters
 * @returns {Promise<Object>} - Events list result
 */
export async function listEvents(params = {}) {
  if (!isCalendarConfigured()) {
    return {
      error: 'Calendar is not configured. Ask the user to run the "calendar" command in the CLI to set up Google Calendar.',
    };
  }

  try {
    const response = await client.listEvents({
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults || 10,
      query: params.query,
    });

    const events = (response.items || []).map(formatEvent);

    return {
      success: true,
      events,
      count: events.length,
      timeRange: {
        from: params.timeMin || 'now',
        to: params.timeMax || 'unspecified',
      },
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Create a new calendar event
 * @param {Object} params - Event parameters
 * @returns {Promise<Object>} - Created event result
 */
export async function createEvent(params) {
  if (!isCalendarConfigured()) {
    return {
      error: 'Calendar is not configured. Ask the user to run the "calendar" command in the CLI to set up Google Calendar.',
    };
  }

  const { summary, start, end, description, location, attendees } = params;

  if (!summary) {
    return { error: 'Event summary (title) is required' };
  }

  if (!start) {
    return { error: 'Event start time is required' };
  }

  try {
    // Build event object
    const event = {
      summary,
    };

    // Handle start/end times
    const startParsed = parseDateTime(start);
    const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(startParsed);

    if (isAllDay) {
      event.start = { date: startParsed };
      if (end) {
        event.end = { date: parseDateTime(end) };
      } else {
        // All-day events need end date to be the next day
        const endDate = new Date(startParsed);
        endDate.setDate(endDate.getDate() + 1);
        event.end = { date: endDate.toISOString().split('T')[0] };
      }
    } else {
      event.start = { dateTime: startParsed };
      if (end) {
        event.end = { dateTime: parseDateTime(end) };
      } else {
        // Default to 1 hour duration
        const endTime = new Date(new Date(startParsed).getTime() + 60 * 60 * 1000);
        event.end = { dateTime: endTime.toISOString() };
      }
    }

    if (description) {
      event.description = description;
    }

    if (location) {
      event.location = location;
    }

    if (attendees && attendees.length > 0) {
      event.attendees = attendees.map(email => ({ email }));
    }

    const created = await client.createEvent(event);

    return {
      success: true,
      message: `Event "${summary}" created successfully`,
      event: formatEvent(created),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Update an existing calendar event
 * @param {Object} params - Update parameters
 * @returns {Promise<Object>} - Updated event result
 */
export async function updateEvent(params) {
  if (!isCalendarConfigured()) {
    return {
      error: 'Calendar is not configured. Ask the user to run the "calendar" command in the CLI to set up Google Calendar.',
    };
  }

  const { eventId, summary, start, end, description, location, attendees } = params;

  if (!eventId) {
    return { error: 'Event ID is required' };
  }

  try {
    // Build update object with only provided fields
    const update = {};

    if (summary !== undefined) {
      update.summary = summary;
    }

    if (start !== undefined) {
      const startParsed = parseDateTime(start);
      const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(startParsed);
      update.start = isAllDay ? { date: startParsed } : { dateTime: startParsed };
    }

    if (end !== undefined) {
      const endParsed = parseDateTime(end);
      const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(endParsed);
      update.end = isAllDay ? { date: endParsed } : { dateTime: endParsed };
    }

    if (description !== undefined) {
      update.description = description;
    }

    if (location !== undefined) {
      update.location = location;
    }

    if (attendees !== undefined) {
      update.attendees = attendees.map(email => ({ email }));
    }

    if (Object.keys(update).length === 0) {
      return { error: 'No fields to update' };
    }

    const updated = await client.updateEvent(eventId, update);

    return {
      success: true,
      message: `Event updated successfully`,
      event: formatEvent(updated),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Delete a calendar event
 * @param {Object} params - Delete parameters
 * @returns {Promise<Object>} - Delete result
 */
export async function deleteEvent(params) {
  if (!isCalendarConfigured()) {
    return {
      error: 'Calendar is not configured. Ask the user to run the "calendar" command in the CLI to set up Google Calendar.',
    };
  }

  const { eventId } = params;

  if (!eventId) {
    return { error: 'Event ID is required' };
  }

  try {
    await client.deleteEvent(eventId);

    return {
      success: true,
      message: `Event deleted successfully`,
      eventId,
    };
  } catch (error) {
    return { error: error.message };
  }
}
