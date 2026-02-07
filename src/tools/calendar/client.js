/**
 * Google Calendar API client
 * Wrapper for Calendar API with automatic authentication
 */

import { getValidAccessToken } from './oauth.js';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Make an authenticated request to Google Calendar API
 * @param {string} endpoint - API endpoint (e.g., '/calendars/primary/events')
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - API response
 */
export async function calendarRequest(endpoint, options = {}) {
  const accessToken = await getValidAccessToken();

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${CALENDAR_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const message = error.error?.message || `API error: ${response.status}`;

    if (response.status === 401) {
      throw new Error('Calendar authentication expired. Run "calendar" command to re-authenticate.');
    }
    if (response.status === 403) {
      throw new Error('Calendar access denied. Check your permissions.');
    }
    if (response.status === 404) {
      throw new Error('Event not found.');
    }

    throw new Error(message);
  }

  // Some endpoints (like DELETE) return no content
  if (response.status === 204) {
    return { success: true };
  }

  return response.json();
}

/**
 * List events from the primary calendar
 * @param {Object} options - List options
 * @returns {Promise<Object>} - Events list
 */
export async function listEvents(options = {}) {
  const {
    timeMin,
    timeMax,
    maxResults = 10,
    query,
    singleEvents = true,
    orderBy = 'startTime',
  } = options;

  const params = new URLSearchParams({
    maxResults: maxResults.toString(),
    singleEvents: singleEvents.toString(),
    orderBy,
  });

  if (timeMin) {
    params.set('timeMin', new Date(timeMin).toISOString());
  } else {
    // Default to now if not specified
    params.set('timeMin', new Date().toISOString());
  }

  if (timeMax) {
    params.set('timeMax', new Date(timeMax).toISOString());
  }

  if (query) {
    params.set('q', query);
  }

  return calendarRequest(`/calendars/primary/events?${params}`);
}

/**
 * Get a single event by ID
 * @param {string} eventId - Event ID
 * @returns {Promise<Object>} - Event object
 */
export async function getEvent(eventId) {
  return calendarRequest(`/calendars/primary/events/${encodeURIComponent(eventId)}`);
}

/**
 * Create a new calendar event
 * @param {Object} event - Event object
 * @returns {Promise<Object>} - Created event
 */
export async function createEvent(event) {
  return calendarRequest('/calendars/primary/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

/**
 * Update an existing event
 * @param {string} eventId - Event ID
 * @param {Object} event - Updated event fields
 * @returns {Promise<Object>} - Updated event
 */
export async function updateEvent(eventId, event) {
  return calendarRequest(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(event),
  });
}

/**
 * Delete an event
 * @param {string} eventId - Event ID
 * @returns {Promise<Object>} - Success status
 */
export async function deleteEvent(eventId) {
  return calendarRequest(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  });
}
