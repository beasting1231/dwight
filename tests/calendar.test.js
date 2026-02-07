/**
 * Google Calendar tool tests
 */

import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

// Mock config module
const mockConfig = {
  calendar: {
    enabled: true,
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-secret',
    tokens: {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expiry_date: Date.now() + 3600000, // 1 hour from now
    },
  },
};

jest.unstable_mockModule('../src/config.js', () => ({
  loadConfig: jest.fn(() => mockConfig),
  saveConfig: jest.fn(),
}));

describe('Calendar OAuth', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch.mockReset();
  });

  it('should generate authorization URL with correct parameters', async () => {
    const { getAuthorizationUrl } = await import('../src/tools/calendar/oauth.js');
    const url = getAuthorizationUrl('test-client-id.apps.googleusercontent.com');

    expect(url).toContain('accounts.google.com/o/oauth2');
    expect(url).toContain('client_id=test-client-id.apps.googleusercontent.com');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A8085%2Foauth%2Fcallback');
  });

  it('should exchange code for tokens', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      }),
    });

    const { exchangeCodeForTokens } = await import('../src/tools/calendar/oauth.js');
    const tokens = await exchangeCodeForTokens(
      'auth-code',
      'client-id',
      'client-secret'
    );

    expect(tokens.access_token).toBe('new-access-token');
    expect(tokens.refresh_token).toBe('new-refresh-token');
    expect(tokens.expiry_date).toBeGreaterThan(Date.now());
  });

  it('should throw error for failed token exchange', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Code already used',
      }),
    });

    const { exchangeCodeForTokens } = await import('../src/tools/calendar/oauth.js');
    await expect(exchangeCodeForTokens(
      'used-code',
      'client-id',
      'client-secret'
    )).rejects.toThrow('Code already used');
  });

  it('should detect expired tokens', async () => {
    const { isTokenExpired } = await import('../src/tools/calendar/oauth.js');

    // Token expired 1 hour ago
    expect(isTokenExpired(Date.now() - 3600000)).toBe(true);

    // Token expires in 1 hour
    expect(isTokenExpired(Date.now() + 3600000)).toBe(false);

    // Token expires in 4 minutes (within 5 min buffer)
    expect(isTokenExpired(Date.now() + 4 * 60 * 1000)).toBe(true);
  });

  it('should refresh access token', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-token',
        expires_in: 3600,
      }),
    });

    const { refreshAccessToken } = await import('../src/tools/calendar/oauth.js');
    const tokens = await refreshAccessToken(
      'refresh-token',
      'client-id',
      'client-secret'
    );

    expect(tokens.access_token).toBe('refreshed-token');
    expect(tokens.refresh_token).toBe('refresh-token'); // Preserved
    expect(tokens.expiry_date).toBeGreaterThan(Date.now());
  });
});

describe('Calendar Client', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch.mockReset();
  });

  it('should list events with correct API call', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'event1',
            summary: 'Test Meeting',
            start: { dateTime: '2024-01-15T10:00:00Z' },
            end: { dateTime: '2024-01-15T11:00:00Z' },
          },
        ],
      }),
    });

    const { listEvents } = await import('../src/tools/calendar/client.js');
    const result = await listEvents({ maxResults: 5 });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('googleapis.com/calendar/v3');
    expect(url).toContain('maxResults=5');
    expect(options.headers.Authorization).toBe('Bearer test-access-token');
  });

  it('should create event with correct parameters', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'new-event',
        summary: 'New Meeting',
        start: { dateTime: '2024-01-16T14:00:00Z' },
        end: { dateTime: '2024-01-16T15:00:00Z' },
      }),
    });

    const { createEvent } = await import('../src/tools/calendar/client.js');
    await createEvent({
      summary: 'New Meeting',
      start: { dateTime: '2024-01-16T14:00:00Z' },
      end: { dateTime: '2024-01-16T15:00:00Z' },
    });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/calendars/primary/events');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body).summary).toBe('New Meeting');
  });

  it('should update event with PATCH method', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'event1',
        summary: 'Updated Meeting',
      }),
    });

    const { updateEvent } = await import('../src/tools/calendar/client.js');
    await updateEvent('event1', { summary: 'Updated Meeting' });

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/calendars/primary/events/event1');
    expect(options.method).toBe('PATCH');
  });

  it('should delete event', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const { deleteEvent } = await import('../src/tools/calendar/client.js');
    const result = await deleteEvent('event1');

    expect(result.success).toBe(true);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/calendars/primary/events/event1');
    expect(options.method).toBe('DELETE');
  });

  it('should handle 401 unauthorized error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Token expired' } }),
    });

    const { listEvents } = await import('../src/tools/calendar/client.js');
    await expect(listEvents()).rejects.toThrow('authentication expired');
  });

  it('should handle 404 not found error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Event not found' } }),
    });

    const { getEvent } = await import('../src/tools/calendar/client.js');
    await expect(getEvent('nonexistent')).rejects.toThrow('not found');
  });
});

describe('Calendar Actions', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch.mockReset();
  });

  it('should format events in AI-friendly structure', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'event1',
            summary: 'Team Standup',
            description: 'Daily sync meeting',
            location: 'Zoom',
            start: { dateTime: '2024-01-15T09:00:00Z' },
            end: { dateTime: '2024-01-15T09:30:00Z' },
            status: 'confirmed',
            htmlLink: 'https://calendar.google.com/event/event1',
            attendees: [
              { email: 'user@example.com', displayName: 'Test User', responseStatus: 'accepted' },
            ],
            creator: { email: 'creator@example.com' },
            organizer: { email: 'organizer@example.com' },
          },
        ],
      }),
    });

    const { listEvents } = await import('../src/tools/calendar/actions.js');
    const result = await listEvents({});

    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toEqual({
      id: 'event1',
      summary: 'Team Standup',
      description: 'Daily sync meeting',
      location: 'Zoom',
      start: '2024-01-15T09:00:00Z',
      end: '2024-01-15T09:30:00Z',
      isAllDay: false,
      status: 'confirmed',
      htmlLink: 'https://calendar.google.com/event/event1',
      attendees: [
        { email: 'user@example.com', name: 'Test User', responseStatus: 'accepted' },
      ],
      creator: 'creator@example.com',
      organizer: 'organizer@example.com',
    });
  });

  it('should create event with default 1 hour duration', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'new-event',
        summary: 'Quick Meeting',
        start: { dateTime: '2024-01-15T14:00:00.000Z' },
        end: { dateTime: '2024-01-15T15:00:00.000Z' },
      }),
    });

    const { createEvent } = await import('../src/tools/calendar/actions.js');
    const result = await createEvent({
      summary: 'Quick Meeting',
      start: '2024-01-15T14:00:00Z',
    });

    expect(result.success).toBe(true);
    expect(result.event.summary).toBe('Quick Meeting');

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.start.dateTime).toBeDefined();
    expect(body.end.dateTime).toBeDefined();
  });

  it('should create all-day event', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'allday-event',
        summary: 'Holiday',
        start: { date: '2024-01-20' },
        end: { date: '2024-01-21' },
      }),
    });

    const { createEvent } = await import('../src/tools/calendar/actions.js');
    await createEvent({
      summary: 'Holiday',
      start: '2024-01-20',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.start.date).toBe('2024-01-20');
    expect(body.end.date).toBe('2024-01-21'); // Next day for all-day
  });

  it('should require summary for create', async () => {
    const { createEvent } = await import('../src/tools/calendar/actions.js');
    const result = await createEvent({ start: '2024-01-15T14:00:00Z' });
    expect(result.error).toContain('summary');
  });

  it('should require start for create', async () => {
    const { createEvent } = await import('../src/tools/calendar/actions.js');
    const result = await createEvent({ summary: 'Test' });
    expect(result.error).toContain('start');
  });

  it('should update only specified fields', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'event1',
        summary: 'Updated Title',
      }),
    });

    const { updateEvent } = await import('../src/tools/calendar/actions.js');
    await updateEvent({
      eventId: 'event1',
      summary: 'Updated Title',
    });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.summary).toBe('Updated Title');
    expect(body.start).toBeUndefined();
    expect(body.location).toBeUndefined();
  });

  it('should require eventId for update', async () => {
    const { updateEvent } = await import('../src/tools/calendar/actions.js');
    const result = await updateEvent({ summary: 'Test' });
    expect(result.error).toContain('Event ID');
  });

  it('should require at least one field to update', async () => {
    const { updateEvent } = await import('../src/tools/calendar/actions.js');
    const result = await updateEvent({ eventId: 'event1' });
    expect(result.error).toContain('No fields to update');
  });

  it('should delete event successfully', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const { deleteEvent } = await import('../src/tools/calendar/actions.js');
    const result = await deleteEvent({ eventId: 'event1' });

    expect(result.success).toBe(true);
    expect(result.message).toContain('deleted');
  });

  it('should require eventId for delete', async () => {
    const { deleteEvent } = await import('../src/tools/calendar/actions.js');
    const result = await deleteEvent({});
    expect(result.error).toContain('Event ID');
  });
});

describe('Calendar Tools Integration', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch.mockReset();
  });

  it('should export all calendar tools', async () => {
    const { calendarTools } = await import('../src/tools/calendar/index.js');
    expect(calendarTools).toHaveLength(4);
    expect(calendarTools.map(t => t.name)).toEqual([
      'calendar_list',
      'calendar_create',
      'calendar_update',
      'calendar_delete',
    ]);
  });

  it('should have correct parameter schemas', async () => {
    const { calendarTools } = await import('../src/tools/calendar/index.js');

    const listTool = calendarTools.find(t => t.name === 'calendar_list');
    expect(listTool.parameters.properties.timeMin).toBeDefined();
    expect(listTool.parameters.required).toEqual([]);

    const createTool = calendarTools.find(t => t.name === 'calendar_create');
    expect(createTool.parameters.properties.summary).toBeDefined();
    expect(createTool.parameters.required).toContain('summary');
    expect(createTool.parameters.required).toContain('start');

    const updateTool = calendarTools.find(t => t.name === 'calendar_update');
    expect(updateTool.parameters.required).toContain('eventId');

    const deleteTool = calendarTools.find(t => t.name === 'calendar_delete');
    expect(deleteTool.parameters.required).toContain('eventId');
  });

  it('should execute calendar_list tool', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const { executeCalendarTool } = await import('../src/tools/calendar/index.js');
    const result = await executeCalendarTool('calendar_list', {});

    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
  });

  it('should return error for unknown tool', async () => {
    const { executeCalendarTool } = await import('../src/tools/calendar/index.js');
    const result = await executeCalendarTool('calendar_unknown', {});

    expect(result.error).toContain('Unknown calendar tool');
  });
});

describe('Calendar Configuration Check', () => {
  it('should detect configured calendar', async () => {
    jest.resetModules();
    const { isCalendarConfigured } = await import('../src/tools/calendar/oauth.js');
    expect(isCalendarConfigured()).toBe(true);
  });

  it('should detect unconfigured calendar', async () => {
    jest.resetModules();

    // Override mock to return empty config
    jest.unstable_mockModule('../src/config.js', () => ({
      loadConfig: jest.fn(() => ({})),
      saveConfig: jest.fn(),
    }));

    const { isCalendarConfigured } = await import('../src/tools/calendar/oauth.js');
    expect(isCalendarConfigured()).toBe(false);
  });
});
