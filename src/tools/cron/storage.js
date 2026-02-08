/**
 * Cron storage - JSON file operations
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const CRON_DIR = path.join(os.homedir(), '.dwight');
const CRON_FILE = path.join(CRON_DIR, 'crons.json');

/**
 * Ensure the .dwight directory exists
 */
function ensureDir() {
  if (!fs.existsSync(CRON_DIR)) {
    fs.mkdirSync(CRON_DIR, { recursive: true });
  }
}

/**
 * Load all crons from storage
 * @returns {Array} Array of cron objects
 */
export function loadCrons() {
  ensureDir();
  try {
    if (fs.existsSync(CRON_FILE)) {
      const data = fs.readFileSync(CRON_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading crons:', error.message);
  }
  return [];
}

/**
 * Save all crons to storage
 * @param {Array} crons - Array of cron objects
 */
export function saveCrons(crons) {
  ensureDir();
  fs.writeFileSync(CRON_FILE, JSON.stringify(crons, null, 2));
}

/**
 * Generate a unique ID for a cron
 * @returns {string} Unique ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

/**
 * Get a cron by ID
 * @param {string} id - Cron ID
 * @returns {Object|null} Cron object or null
 */
export function getCronById(id) {
  const crons = loadCrons();
  return crons.find(c => c.id === id) || null;
}

/**
 * Update a cron by ID
 * @param {string} id - Cron ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated cron or null
 */
export function updateCron(id, updates) {
  const crons = loadCrons();
  const index = crons.findIndex(c => c.id === id);
  if (index === -1) return null;

  crons[index] = { ...crons[index], ...updates };
  saveCrons(crons);
  return crons[index];
}

/**
 * Delete a cron by ID
 * @param {string} id - Cron ID
 * @returns {boolean} True if deleted
 */
export function deleteCron(id) {
  const crons = loadCrons();
  const index = crons.findIndex(c => c.id === id);
  if (index === -1) return false;

  crons.splice(index, 1);
  saveCrons(crons);
  return true;
}

/**
 * Add a new cron
 * @param {Object} cron - Cron object
 * @returns {Object} Created cron with ID
 */
export function addCron(cron) {
  const crons = loadCrons();
  const newCron = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    enabled: true,
    lastRun: null,
    ...cron,
  };
  crons.push(newCron);
  saveCrons(crons);
  return newCron;
}
