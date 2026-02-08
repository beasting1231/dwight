/**
 * Tests for cron tools - patterns and logic only (no fs mocking needed)
 */

import { jest } from '@jest/globals';

// Import pattern utilities (no fs dependency)
import {
  calculateNextRun,
  formatPattern,
  isDue,
  wasMissed
} from '../src/tools/cron/patterns.js';

describe('Cron Patterns', () => {
  describe('calculateNextRun', () => {
    it('calculates next run for daily pattern', () => {
      const cron = {
        pattern: { type: 'daily', time: '09:00' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getHours()).toBe(9);
      expect(nextRun.getMinutes()).toBe(0);
    });

    it('returns null for past one-time pattern', () => {
      const cron = {
        pattern: { type: 'once', datetime: '2020-01-01T09:00:00' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeNull();
    });

    it('returns future date for future one-time pattern', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const cron = {
        pattern: { type: 'once', datetime: futureDate.toISOString() },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      // Seconds and milliseconds should be stripped to 0 for minute-based checking
      expect(nextRun.getSeconds()).toBe(0);
      expect(nextRun.getMilliseconds()).toBe(0);
      // Minutes should match
      expect(nextRun.getMinutes()).toBe(futureDate.getMinutes());
    });

    it('calculates next run for weekly pattern', () => {
      const cron = {
        pattern: { type: 'weekly', days: ['monday'], time: '10:00' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getDay()).toBe(1); // Monday
      expect(nextRun.getHours()).toBe(10);
    });

    it('calculates next run for weekly pattern with multiple days', () => {
      const cron = {
        pattern: { type: 'weekly', days: ['monday', 'wednesday', 'friday'], time: '08:00' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      expect([1, 3, 5]).toContain(nextRun.getDay()); // Mon, Wed, or Fri
      expect(nextRun.getHours()).toBe(8);
    });

    it('calculates next run for monthly by date', () => {
      const cron = {
        pattern: { type: 'monthly', dayOfMonth: 15, time: '14:00' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getDate()).toBe(15);
      expect(nextRun.getHours()).toBe(14);
    });

    it('calculates next run for monthly by weekday (2nd Thursday)', () => {
      const cron = {
        pattern: { type: 'monthly', weekday: 'thursday', occurrence: 2, time: '15:00' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getDay()).toBe(4); // Thursday
      expect(nextRun.getHours()).toBe(15);

      // Verify it's the 2nd Thursday (between day 8-14)
      expect(nextRun.getDate()).toBeGreaterThanOrEqual(8);
      expect(nextRun.getDate()).toBeLessThanOrEqual(14);
    });

    it('calculates next run for monthly by weekday (1st Monday)', () => {
      const cron = {
        pattern: { type: 'monthly', weekday: 'monday', occurrence: 1, time: '09:00' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      expect(nextRun.getDay()).toBe(1); // Monday
      expect(nextRun.getHours()).toBe(9);

      // Verify it's the 1st Monday (between day 1-7)
      expect(nextRun.getDate()).toBeGreaterThanOrEqual(1);
      expect(nextRun.getDate()).toBeLessThanOrEqual(7);
    });

    it('calculates next run for interval pattern (hours)', () => {
      const cron = {
        pattern: { type: 'interval', hours: 4 },
        enabled: true,
        lastRun: null,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      const expectedTime = Date.now() + 4 * 60 * 60 * 1000;
      expect(nextRun.getTime()).toBeCloseTo(expectedTime, -4); // Within 10 seconds
    });

    it('calculates next run for interval pattern (minutes)', () => {
      const cron = {
        pattern: { type: 'interval', minutes: 30 },
        enabled: true,
        lastRun: null,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);
      const expectedTime = Date.now() + 30 * 60 * 1000;
      expect(nextRun.getTime()).toBeCloseTo(expectedTime, -4);
    });

    it('calculates next run for interval based on lastRun', () => {
      const lastRun = new Date();
      lastRun.setHours(lastRun.getHours() - 1); // 1 hour ago

      const cron = {
        pattern: { type: 'interval', hours: 2 },
        enabled: true,
        lastRun: lastRun.toISOString(),
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeInstanceOf(Date);

      // Should be 1 hour from now (2 hours after lastRun)
      const expectedTime = lastRun.getTime() + 2 * 60 * 60 * 1000;
      expect(nextRun.getTime()).toBeCloseTo(expectedTime, -4);
    });

    it('returns null for unknown pattern type', () => {
      const cron = {
        pattern: { type: 'unknown' },
        enabled: true,
      };
      const nextRun = calculateNextRun(cron);
      expect(nextRun).toBeNull();
    });
  });

  describe('formatPattern', () => {
    it('formats once pattern', () => {
      const pattern = { type: 'once', datetime: '2026-02-09T08:00:00' };
      const result = formatPattern(pattern);
      expect(result).toContain('once at');
    });

    it('formats daily pattern', () => {
      const pattern = { type: 'daily', time: '09:00' };
      expect(formatPattern(pattern)).toBe('daily at 09:00');
    });

    it('formats weekly pattern with one day', () => {
      const pattern = { type: 'weekly', days: ['monday'], time: '14:00' };
      expect(formatPattern(pattern)).toBe('every monday at 14:00');
    });

    it('formats weekly pattern with multiple days', () => {
      const pattern = { type: 'weekly', days: ['monday', 'friday'], time: '14:00' };
      expect(formatPattern(pattern)).toBe('every monday, friday at 14:00');
    });

    it('formats monthly by date pattern', () => {
      const pattern = { type: 'monthly', dayOfMonth: 15, time: '10:00' };
      expect(formatPattern(pattern)).toBe('monthly on day 15 at 10:00');
    });

    it('formats monthly by weekday pattern (1st)', () => {
      const pattern = { type: 'monthly', weekday: 'monday', occurrence: 1, time: '09:00' };
      expect(formatPattern(pattern)).toBe('monthly on the 1st monday at 09:00');
    });

    it('formats monthly by weekday pattern (2nd)', () => {
      const pattern = { type: 'monthly', weekday: 'thursday', occurrence: 2, time: '15:00' };
      expect(formatPattern(pattern)).toBe('monthly on the 2nd thursday at 15:00');
    });

    it('formats monthly by weekday pattern (3rd)', () => {
      const pattern = { type: 'monthly', weekday: 'wednesday', occurrence: 3, time: '11:00' };
      expect(formatPattern(pattern)).toBe('monthly on the 3rd wednesday at 11:00');
    });

    it('formats interval pattern with hours', () => {
      const pattern = { type: 'interval', hours: 4 };
      expect(formatPattern(pattern)).toBe('every 4 hours');
    });

    it('formats interval pattern with single hour', () => {
      const pattern = { type: 'interval', hours: 1 };
      expect(formatPattern(pattern)).toBe('every 1 hour');
    });

    it('formats interval pattern with minutes', () => {
      const pattern = { type: 'interval', minutes: 30 };
      expect(formatPattern(pattern)).toBe('every 30 minutes');
    });

    it('formats interval pattern with single minute', () => {
      const pattern = { type: 'interval', minutes: 1 };
      expect(formatPattern(pattern)).toBe('every 1 minute');
    });

    it('returns unknown for invalid pattern', () => {
      const pattern = { type: 'invalid' };
      expect(formatPattern(pattern)).toBe('unknown pattern');
    });
  });

  describe('isDue', () => {
    it('returns false for disabled cron', () => {
      const cron = { enabled: false, nextRun: new Date().toISOString() };
      expect(isDue(cron)).toBe(false);
    });

    it('returns false for cron without nextRun', () => {
      const cron = { enabled: true, nextRun: null };
      expect(isDue(cron)).toBe(false);
    });

    it('returns true for cron with past nextRun', () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      const cron = { enabled: true, nextRun: pastDate };
      expect(isDue(cron)).toBe(true);
    });

    it('returns true for cron with current nextRun', () => {
      const currentDate = new Date().toISOString();
      const cron = { enabled: true, nextRun: currentDate };
      expect(isDue(cron)).toBe(true);
    });

    it('returns false for cron with future nextRun', () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      const cron = { enabled: true, nextRun: futureDate };
      expect(isDue(cron)).toBe(false);
    });
  });

  describe('wasMissed', () => {
    it('returns false for disabled cron', () => {
      const startTime = new Date();
      const dueTime = new Date(startTime.getTime() - 60000).toISOString();
      const cron = { enabled: false, nextRun: dueTime, lastRun: null };
      expect(wasMissed(cron, startTime)).toBe(false);
    });

    it('returns false for cron without nextRun', () => {
      const startTime = new Date();
      const cron = { enabled: true, nextRun: null, lastRun: null };
      expect(wasMissed(cron, startTime)).toBe(false);
    });

    it('returns true for cron that was due before startup', () => {
      const startTime = new Date();
      const dueTime = new Date(startTime.getTime() - 60000).toISOString();
      const cron = { enabled: true, nextRun: dueTime, lastRun: null };
      expect(wasMissed(cron, startTime)).toBe(true);
    });

    it('returns false for cron due after startup', () => {
      const startTime = new Date();
      const dueTime = new Date(startTime.getTime() + 60000).toISOString();
      const cron = { enabled: true, nextRun: dueTime, lastRun: null };
      expect(wasMissed(cron, startTime)).toBe(false);
    });

    it('returns false if lastRun is after nextRun (already ran)', () => {
      const startTime = new Date();
      const dueTime = new Date(startTime.getTime() - 120000).toISOString(); // 2 min ago
      const lastRunTime = new Date(startTime.getTime() - 60000).toISOString(); // 1 min ago
      const cron = { enabled: true, nextRun: dueTime, lastRun: lastRunTime };
      expect(wasMissed(cron, startTime)).toBe(false);
    });

    it('returns true if lastRun is before nextRun (missed)', () => {
      const startTime = new Date();
      const lastRunTime = new Date(startTime.getTime() - 120000).toISOString(); // 2 min ago
      const dueTime = new Date(startTime.getTime() - 60000).toISOString(); // 1 min ago
      const cron = { enabled: true, nextRun: dueTime, lastRun: lastRunTime };
      expect(wasMissed(cron, startTime)).toBe(true);
    });
  });
});

describe('Cron Tool Definitions', () => {
  it('exports cronTools array', async () => {
    const { cronTools } = await import('../src/tools/cron/index.js');
    expect(Array.isArray(cronTools)).toBe(true);
    expect(cronTools.length).toBeGreaterThan(0);
  });

  it('has cron_create tool', async () => {
    const { cronTools } = await import('../src/tools/cron/index.js');
    const createTool = cronTools.find(t => t.name === 'cron_create');
    expect(createTool).toBeDefined();
    expect(createTool.description).toContain('scheduled task');
    expect(createTool.parameters.required).toContain('description');
    expect(createTool.parameters.required).toContain('prompt');
    expect(createTool.parameters.required).toContain('pattern');
  });

  it('has cron_list tool', async () => {
    const { cronTools } = await import('../src/tools/cron/index.js');
    const listTool = cronTools.find(t => t.name === 'cron_list');
    expect(listTool).toBeDefined();
    expect(listTool.description).toContain('List');
  });

  it('has cron_get tool', async () => {
    const { cronTools } = await import('../src/tools/cron/index.js');
    const getTool = cronTools.find(t => t.name === 'cron_get');
    expect(getTool).toBeDefined();
    expect(getTool.parameters.required).toContain('id');
  });

  it('has cron_toggle tool', async () => {
    const { cronTools } = await import('../src/tools/cron/index.js');
    const toggleTool = cronTools.find(t => t.name === 'cron_toggle');
    expect(toggleTool).toBeDefined();
    expect(toggleTool.parameters.required).toContain('id');
  });

  it('has cron_delete tool', async () => {
    const { cronTools } = await import('../src/tools/cron/index.js');
    const deleteTool = cronTools.find(t => t.name === 'cron_delete');
    expect(deleteTool).toBeDefined();
    expect(deleteTool.parameters.required).toContain('id');
  });

  it('has cron_update tool', async () => {
    const { cronTools } = await import('../src/tools/cron/index.js');
    const updateTool = cronTools.find(t => t.name === 'cron_update');
    expect(updateTool).toBeDefined();
    expect(updateTool.parameters.required).toContain('id');
  });
});
