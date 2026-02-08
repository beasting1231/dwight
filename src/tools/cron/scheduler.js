/**
 * Cron scheduler - Background loop that checks and executes crons
 */

import { getDueCrons, getMissedCrons, markExecuted } from './actions.js';
import { loadCrons } from './storage.js';

let schedulerInterval = null;
let appStartTime = null;
let missedCronsChecked = false;
let executeCallback = null;
let missedCallback = null;

/**
 * Start the scheduler loop
 * @param {Object} options - Scheduler options
 * @param {Function} options.onExecute - Callback when a cron is due (receives cron object)
 * @param {Function} options.onMissed - Callback for missed crons (receives array of crons)
 * @param {number} options.intervalMs - Check interval in ms (default: 60000)
 */
export function startScheduler(options = {}) {
  if (schedulerInterval) {
    console.log('Scheduler already running');
    return;
  }

  appStartTime = new Date();
  executeCallback = options.onExecute;
  missedCallback = options.onMissed;
  const intervalMs = options.intervalMs || 60000; // 1 minute default

  // Initial check for missed crons
  setTimeout(() => {
    checkMissedCrons();
  }, 2000); // Wait 2 seconds for bot to be ready

  // Start the check loop
  schedulerInterval = setInterval(() => {
    checkDueCrons();
  }, intervalMs);

  console.log('Cron scheduler started');
}

/**
 * Stop the scheduler loop
 */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Cron scheduler stopped');
  }
}

/**
 * Check for missed crons (runs once on startup)
 */
function checkMissedCrons() {
  if (missedCronsChecked) return;
  missedCronsChecked = true;

  const missed = getMissedCrons(appStartTime);

  if (missed.length > 0 && missedCallback) {
    missedCallback(missed);
  }
}

/**
 * Check for due crons and execute them
 */
function checkDueCrons() {
  const due = getDueCrons();

  for (const cron of due) {
    if (executeCallback) {
      // Mark as executed before running to prevent double-execution
      markExecuted(cron.id);

      // Execute the cron
      executeCallback(cron);
    }
  }
}

/**
 * Get scheduler status
 * @returns {Object} Status info
 */
export function getSchedulerStatus() {
  const crons = loadCrons();
  const enabled = crons.filter(c => c.enabled);
  const now = new Date();

  // Find next upcoming cron
  let nextUp = null;
  let nextUpTime = null;

  for (const cron of enabled) {
    if (cron.nextRun) {
      const nextRun = new Date(cron.nextRun);
      if (!nextUpTime || nextRun < nextUpTime) {
        nextUpTime = nextRun;
        nextUp = cron;
      }
    }
  }

  return {
    running: schedulerInterval !== null,
    totalCrons: crons.length,
    enabledCrons: enabled.length,
    nextCron: nextUp ? {
      id: nextUp.id,
      description: nextUp.description,
      nextRun: nextUp.nextRun,
      inMinutes: Math.round((nextUpTime - now) / 60000),
    } : null,
  };
}

/**
 * Force an immediate check (useful for testing)
 */
export function forceCheck() {
  checkDueCrons();
}
