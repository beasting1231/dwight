/**
 * Claude Code session persistence
 * Saves/loads session metadata to ~/.dwight/claude-sessions.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const DWIGHT_DIR = path.join(os.homedir(), '.dwight');
const SESSIONS_FILE = path.join(DWIGHT_DIR, 'claude-sessions.json');

/**
 * Ensure the storage directory exists
 */
function ensureDir() {
  if (!fs.existsSync(DWIGHT_DIR)) {
    fs.mkdirSync(DWIGHT_DIR, { recursive: true });
  }
}

/**
 * Load saved sessions from disk
 * @returns {Array} Array of session objects
 */
export function loadSavedSessions() {
  try {
    ensureDir();
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load Claude sessions:', error.message);
  }
  return [];
}

/**
 * Save sessions to disk
 * @param {Map} sessionsMap - Map of sessionId -> session object
 */
export function saveSessions(sessionsMap) {
  try {
    ensureDir();

    // Convert Map to serializable array, excluding process references
    const serializable = Array.from(sessionsMap.values()).map(session => ({
      id: session.id,
      chatId: session.chatId,
      status: session.status,
      workingDir: session.workingDir,
      startedAt: session.startedAt,
      lastActivity: session.lastActivity,
      prompt: session.prompt,
      totalCost: session.totalCost || 0,
      model: session.model,
      // Don't persist: process, pendingQuestion, outputBuffer
    }));

    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(serializable, null, 2));
  } catch (error) {
    console.error('Failed to save Claude sessions:', error.message);
  }
}

/**
 * Clear all saved sessions
 */
export function clearSavedSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      fs.unlinkSync(SESSIONS_FILE);
    }
  } catch (error) {
    console.error('Failed to clear Claude sessions:', error.message);
  }
}
