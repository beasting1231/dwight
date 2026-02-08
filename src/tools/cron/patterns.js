/**
 * Cron pattern parsing and next-run calculation
 *
 * Supports flexible patterns that go beyond standard cron:
 * - One-time: { type: 'once', datetime: '2026-02-09T08:00:00' }
 * - Daily: { type: 'daily', time: '09:00' }
 * - Weekly: { type: 'weekly', days: ['monday', 'friday'], time: '09:00' }
 * - Monthly by date: { type: 'monthly', dayOfMonth: 15, time: '09:00' }
 * - Monthly by weekday: { type: 'monthly', weekday: 'thursday', occurrence: 2, time: '14:00' }
 * - Interval: { type: 'interval', hours: 4 } or { minutes: 30 }
 */

const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Parse time string "HH:MM" to hours and minutes
 * @param {string} time - Time string
 * @returns {Object} { hours, minutes }
 */
function parseTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Get timezone offset in minutes
 * @param {string} timezone - IANA timezone string
 * @returns {number} Offset in minutes
 */
function getTimezoneOffset(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    // This is a simplified approach - for production, use a proper timezone library
    return now.getTimezoneOffset();
  } catch {
    return new Date().getTimezoneOffset();
  }
}

/**
 * Calculate next run time for a one-time cron
 * @param {Object} pattern - Pattern object
 * @returns {Date|null} Next run date or null if passed
 */
function nextRunOnce(pattern) {
  const target = new Date(pattern.datetime);
  // Strip seconds and milliseconds for consistent minute-based checking
  target.setSeconds(0, 0);
  const now = new Date();
  return target > now ? target : null;
}

/**
 * Calculate next run time for a daily cron
 * @param {Object} pattern - Pattern object
 * @returns {Date} Next run date
 */
function nextRunDaily(pattern) {
  const now = new Date();
  const { hours, minutes } = parseTime(pattern.time);

  const today = new Date(now);
  today.setHours(hours, minutes, 0, 0);

  if (today > now) {
    return today;
  }

  // Tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/**
 * Calculate next run time for a weekly cron
 * @param {Object} pattern - Pattern object
 * @returns {Date} Next run date
 */
function nextRunWeekly(pattern) {
  const now = new Date();
  const { hours, minutes } = parseTime(pattern.time);
  const targetDays = pattern.days.map(d => DAYS_OF_WEEK.indexOf(d.toLowerCase()));

  // Check next 7 days
  for (let i = 0; i < 7; i++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + i);
    candidate.setHours(hours, minutes, 0, 0);

    if (targetDays.includes(candidate.getDay()) && candidate > now) {
      return candidate;
    }
  }

  // Fallback: first matching day next week
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);
  nextWeek.setHours(hours, minutes, 0, 0);
  while (!targetDays.includes(nextWeek.getDay())) {
    nextWeek.setDate(nextWeek.getDate() + 1);
  }
  return nextWeek;
}

/**
 * Calculate next run time for a monthly-by-date cron
 * @param {Object} pattern - Pattern object
 * @returns {Date} Next run date
 */
function nextRunMonthlyDate(pattern) {
  const now = new Date();
  const { hours, minutes } = parseTime(pattern.time);
  const targetDay = pattern.dayOfMonth;

  // Try this month
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), targetDay, hours, minutes, 0, 0);
  if (thisMonth > now) {
    return thisMonth;
  }

  // Next month
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, targetDay, hours, minutes, 0, 0);
  return nextMonth;
}

/**
 * Get the nth occurrence of a weekday in a month
 * @param {number} year - Year
 * @param {number} month - Month (0-indexed)
 * @param {number} weekday - Day of week (0-6)
 * @param {number} occurrence - Which occurrence (1-5)
 * @returns {Date} The date
 */
function getNthWeekdayOfMonth(year, month, weekday, occurrence) {
  const firstDay = new Date(year, month, 1);
  const firstWeekday = firstDay.getDay();

  // Days until first occurrence of this weekday
  let daysUntil = weekday - firstWeekday;
  if (daysUntil < 0) daysUntil += 7;

  // Add weeks for nth occurrence
  const day = 1 + daysUntil + (occurrence - 1) * 7;

  return new Date(year, month, day);
}

/**
 * Calculate next run time for a monthly-by-weekday cron (e.g., "2nd Thursday")
 * @param {Object} pattern - Pattern object
 * @returns {Date} Next run date
 */
function nextRunMonthlyWeekday(pattern) {
  const now = new Date();
  const { hours, minutes } = parseTime(pattern.time);
  const weekday = DAYS_OF_WEEK.indexOf(pattern.weekday.toLowerCase());
  const occurrence = pattern.occurrence;

  // Try this month
  const thisMonth = getNthWeekdayOfMonth(now.getFullYear(), now.getMonth(), weekday, occurrence);
  thisMonth.setHours(hours, minutes, 0, 0);

  if (thisMonth > now) {
    return thisMonth;
  }

  // Next month
  const nextMonth = getNthWeekdayOfMonth(now.getFullYear(), now.getMonth() + 1, weekday, occurrence);
  nextMonth.setHours(hours, minutes, 0, 0);
  return nextMonth;
}

/**
 * Calculate next run time for an interval-based cron
 * @param {Object} pattern - Pattern object
 * @param {Date|null} lastRun - Last run time
 * @returns {Date} Next run date
 */
function nextRunInterval(pattern, lastRun) {
  const now = new Date();
  const intervalMs = (pattern.hours || 0) * 60 * 60 * 1000 + (pattern.minutes || 0) * 60 * 1000;

  if (!lastRun) {
    // First run: now + interval
    return new Date(now.getTime() + intervalMs);
  }

  const lastRunDate = new Date(lastRun);
  const next = new Date(lastRunDate.getTime() + intervalMs);

  // If we missed runs, schedule for now
  return next > now ? next : new Date(now.getTime() + 60000); // 1 minute from now
}

/**
 * Calculate the next run time for a cron
 * @param {Object} cron - Cron object with pattern
 * @returns {Date|null} Next run date or null if no more runs
 */
export function calculateNextRun(cron) {
  const pattern = cron.pattern;

  switch (pattern.type) {
    case 'once':
      return nextRunOnce(pattern);
    case 'daily':
      return nextRunDaily(pattern);
    case 'weekly':
      return nextRunWeekly(pattern);
    case 'monthly':
      if (pattern.dayOfMonth) {
        return nextRunMonthlyDate(pattern);
      } else if (pattern.weekday && pattern.occurrence) {
        return nextRunMonthlyWeekday(pattern);
      }
      return null;
    case 'interval':
      return nextRunInterval(pattern, cron.lastRun);
    default:
      return null;
  }
}

/**
 * Format a pattern for human-readable display
 * @param {Object} pattern - Pattern object
 * @returns {string} Human-readable description
 */
export function formatPattern(pattern) {
  switch (pattern.type) {
    case 'once':
      return `once at ${new Date(pattern.datetime).toLocaleString()}`;
    case 'daily':
      return `daily at ${pattern.time}`;
    case 'weekly':
      return `every ${pattern.days.join(', ')} at ${pattern.time}`;
    case 'monthly':
      if (pattern.dayOfMonth) {
        return `monthly on day ${pattern.dayOfMonth} at ${pattern.time}`;
      } else if (pattern.weekday && pattern.occurrence) {
        const ordinal = ['', '1st', '2nd', '3rd', '4th', '5th'][pattern.occurrence];
        return `monthly on the ${ordinal} ${pattern.weekday} at ${pattern.time}`;
      }
      return 'monthly (invalid pattern)';
    case 'interval':
      if (pattern.hours) {
        return `every ${pattern.hours} hour${pattern.hours > 1 ? 's' : ''}`;
      } else if (pattern.minutes) {
        return `every ${pattern.minutes} minute${pattern.minutes > 1 ? 's' : ''}`;
      }
      return 'interval (invalid)';
    default:
      return 'unknown pattern';
  }
}

/**
 * Check if a cron is due (should run now)
 * @param {Object} cron - Cron object
 * @returns {boolean} True if due
 */
export function isDue(cron) {
  if (!cron.enabled) return false;
  if (!cron.nextRun) return false;

  const now = new Date();
  const nextRun = new Date(cron.nextRun);

  return nextRun <= now;
}

/**
 * Check if a cron was missed (due while offline)
 * @param {Object} cron - Cron object
 * @param {Date} startTime - When the app started
 * @returns {boolean} True if missed
 */
export function wasMissed(cron, startTime) {
  if (!cron.enabled) return false;
  if (!cron.nextRun) return false;

  const nextRun = new Date(cron.nextRun);

  // Was due before we started, but after last run
  return nextRun < startTime && (!cron.lastRun || nextRun > new Date(cron.lastRun));
}
