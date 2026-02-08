/**
 * Cron CRUD actions
 */

import { loadCrons, saveCrons, addCron, getCronById, updateCron, deleteCron } from './storage.js';
import { calculateNextRun, formatPattern } from './patterns.js';

/**
 * Create a new cron job
 * @param {Object} params - Cron parameters
 * @param {string} params.description - Human-readable description
 * @param {string} params.prompt - The prompt to execute
 * @param {Object} params.pattern - When to run (see patterns.js)
 * @param {string} params.timezone - IANA timezone (optional)
 * @returns {Object} Result with created cron
 */
export async function createCron(params) {
  if (!params.description) {
    return { error: 'Description is required' };
  }
  if (!params.prompt) {
    return { error: 'Prompt is required' };
  }
  if (!params.pattern) {
    return { error: 'Pattern is required' };
  }
  if (!params.pattern.type) {
    return { error: 'Pattern type is required' };
  }

  // Validate pattern type
  const validTypes = ['once', 'daily', 'weekly', 'monthly', 'interval'];
  if (!validTypes.includes(params.pattern.type)) {
    return { error: `Invalid pattern type. Must be one of: ${validTypes.join(', ')}` };
  }

  // Create the cron
  const cron = addCron({
    description: params.description,
    prompt: params.prompt,
    pattern: params.pattern,
    timezone: params.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // Calculate next run
  const nextRun = calculateNextRun(cron);
  if (nextRun) {
    updateCron(cron.id, { nextRun: nextRun.toISOString() });
    cron.nextRun = nextRun.toISOString();
  }

  return {
    success: true,
    message: `Cron job created: "${params.description}"`,
    cron: {
      id: cron.id,
      description: cron.description,
      schedule: formatPattern(cron.pattern),
      nextRun: cron.nextRun ? new Date(cron.nextRun).toLocaleString() : 'never',
      enabled: cron.enabled,
    },
  };
}

/**
 * List all cron jobs
 * @param {Object} params - Optional filters
 * @param {boolean} params.enabledOnly - Only show enabled crons
 * @returns {Object} Result with cron list
 */
export async function listCrons(params = {}) {
  let crons = loadCrons();

  if (params.enabledOnly) {
    crons = crons.filter(c => c.enabled);
  }

  if (crons.length === 0) {
    return {
      success: true,
      message: 'No cron jobs found.',
      crons: [],
    };
  }

  return {
    success: true,
    count: crons.length,
    crons: crons.map(c => ({
      id: c.id,
      description: c.description,
      schedule: formatPattern(c.pattern),
      nextRun: c.nextRun ? new Date(c.nextRun).toLocaleString() : 'never',
      lastRun: c.lastRun ? new Date(c.lastRun).toLocaleString() : 'never',
      enabled: c.enabled,
    })),
  };
}

/**
 * Get a specific cron job
 * @param {Object} params - Parameters
 * @param {string} params.id - Cron ID
 * @returns {Object} Result with cron details
 */
export async function getCron(params) {
  if (!params.id) {
    return { error: 'Cron ID is required' };
  }

  const cron = getCronById(params.id);
  if (!cron) {
    return { error: `Cron not found: ${params.id}` };
  }

  return {
    success: true,
    cron: {
      id: cron.id,
      description: cron.description,
      prompt: cron.prompt,
      pattern: cron.pattern,
      schedule: formatPattern(cron.pattern),
      nextRun: cron.nextRun ? new Date(cron.nextRun).toLocaleString() : 'never',
      lastRun: cron.lastRun ? new Date(cron.lastRun).toLocaleString() : 'never',
      enabled: cron.enabled,
      timezone: cron.timezone,
      createdAt: cron.createdAt,
    },
  };
}

/**
 * Toggle a cron job enabled/disabled
 * @param {Object} params - Parameters
 * @param {string} params.id - Cron ID
 * @param {boolean} params.enabled - New enabled state (optional, toggles if not provided)
 * @returns {Object} Result
 */
export async function toggleCron(params) {
  if (!params.id) {
    return { error: 'Cron ID is required' };
  }

  const cron = getCronById(params.id);
  if (!cron) {
    return { error: `Cron not found: ${params.id}` };
  }

  const newState = params.enabled !== undefined ? params.enabled : !cron.enabled;
  updateCron(params.id, { enabled: newState });

  // Recalculate next run if enabling
  if (newState) {
    const nextRun = calculateNextRun({ ...cron, enabled: true });
    if (nextRun) {
      updateCron(params.id, { nextRun: nextRun.toISOString() });
    }
  }

  return {
    success: true,
    message: `Cron "${cron.description}" ${newState ? 'enabled' : 'disabled'}`,
    enabled: newState,
  };
}

/**
 * Delete a cron job
 * @param {Object} params - Parameters
 * @param {string} params.id - Cron ID
 * @returns {Object} Result
 */
export async function removeCron(params) {
  if (!params.id) {
    return { error: 'Cron ID is required' };
  }

  const cron = getCronById(params.id);
  if (!cron) {
    return { error: `Cron not found: ${params.id}` };
  }

  const description = cron.description;
  deleteCron(params.id);

  return {
    success: true,
    message: `Cron "${description}" deleted`,
  };
}

/**
 * Update a cron job
 * @param {Object} params - Parameters
 * @param {string} params.id - Cron ID
 * @param {string} params.description - New description (optional)
 * @param {string} params.prompt - New prompt (optional)
 * @param {Object} params.pattern - New pattern (optional)
 * @returns {Object} Result
 */
export async function editCron(params) {
  if (!params.id) {
    return { error: 'Cron ID is required' };
  }

  const cron = getCronById(params.id);
  if (!cron) {
    return { error: `Cron not found: ${params.id}` };
  }

  const updates = {};
  if (params.description) updates.description = params.description;
  if (params.prompt) updates.prompt = params.prompt;
  if (params.pattern) updates.pattern = params.pattern;

  if (Object.keys(updates).length === 0) {
    return { error: 'No updates provided' };
  }

  updateCron(params.id, updates);

  // Recalculate next run if pattern changed
  if (params.pattern) {
    const updatedCron = getCronById(params.id);
    const nextRun = calculateNextRun(updatedCron);
    if (nextRun) {
      updateCron(params.id, { nextRun: nextRun.toISOString() });
    }
  }

  return {
    success: true,
    message: `Cron "${cron.description}" updated`,
  };
}

/**
 * Mark a cron as executed and calculate next run
 * @param {string} id - Cron ID
 * @returns {Object} Updated cron
 */
export function markExecuted(id) {
  const cron = getCronById(id);
  if (!cron) return null;

  const now = new Date();
  updateCron(id, { lastRun: now.toISOString() });

  // Calculate next run
  const updatedCron = getCronById(id);
  const nextRun = calculateNextRun(updatedCron);

  if (nextRun) {
    updateCron(id, { nextRun: nextRun.toISOString() });
  } else if (cron.pattern.type === 'once') {
    // One-time cron completed, delete it
    deleteCron(id);
    return null;
  }

  return getCronById(id);
}

/**
 * Get crons that are due to run
 * @returns {Array} Array of due crons
 */
export function getDueCrons() {
  const crons = loadCrons();
  const now = new Date();

  return crons.filter(c => {
    if (!c.enabled) return false;
    if (!c.nextRun) return false;
    return new Date(c.nextRun) <= now;
  });
}

/**
 * Get crons that were missed (due while offline)
 * @param {Date} startTime - When the app started
 * @returns {Array} Array of missed crons
 */
export function getMissedCrons(startTime) {
  const crons = loadCrons();

  return crons.filter(c => {
    if (!c.enabled) return false;
    if (!c.nextRun) return false;

    const nextRun = new Date(c.nextRun);
    // Was due before we started, but we haven't run it
    return nextRun < startTime && (!c.lastRun || new Date(c.lastRun) < nextRun);
  });
}
