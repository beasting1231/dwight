import { loadConfig } from './config.js';

// Conversation history per chat
export const conversations = new Map();

// Verified users (chatId -> phone number)
export const verifiedUsers = new Map();

// Processing state
export let processingCount = 0;

// Pending notifications queue (for memory updates, etc.)
const pendingNotifications = [];

export function addNotification(message) {
  pendingNotifications.push(message);
}

export function getAndClearNotifications() {
  const notifications = [...pendingNotifications];
  pendingNotifications.length = 0;
  return notifications;
}

// Flag to trigger config/memory reload
let needsReload = false;

// Pending emails awaiting confirmation (chatId -> email details)
const pendingEmails = new Map();

// Track if user has responded since draft was created
export function setPendingEmail(chatId, emailData) {
  pendingEmails.set(chatId, { ...emailData, timestamp: Date.now(), userConfirmed: false });
}

export function getPendingEmail(chatId) {
  const pending = pendingEmails.get(chatId);
  // Expire after 5 minutes
  if (pending && Date.now() - pending.timestamp > 5 * 60 * 1000) {
    pendingEmails.delete(chatId);
    return null;
  }
  return pending;
}

export function markPendingEmailConfirmable(chatId) {
  const pending = pendingEmails.get(chatId);
  if (pending) {
    pending.userConfirmed = true;
  }
}

export function clearPendingEmail(chatId) {
  pendingEmails.delete(chatId);
}

// Pending bash commands awaiting confirmation (chatId -> command details)
const pendingBashCommands = new Map();

/**
 * Set a pending bash command awaiting user confirmation
 * @param {string|number} chatId - The chat ID
 * @param {Object} commandData - The command details { command, reason, description }
 */
export function setPendingBashCommand(chatId, commandData) {
  pendingBashCommands.set(chatId, {
    ...commandData,
    timestamp: Date.now(),
    confirmed: false,
  });
}

/**
 * Get a pending bash command for a chat
 * @param {string|number} chatId - The chat ID
 * @returns {Object|null} The pending command or null
 */
export function getPendingBashCommand(chatId) {
  const pending = pendingBashCommands.get(chatId);
  // Expire after 2 minutes
  if (pending && Date.now() - pending.timestamp > 2 * 60 * 1000) {
    pendingBashCommands.delete(chatId);
    return null;
  }
  return pending || null;
}

/**
 * Mark a pending bash command as confirmed by the user
 * @param {string|number} chatId - The chat ID
 * @returns {boolean} Whether a command was confirmed
 */
export function confirmPendingBashCommand(chatId) {
  const pending = pendingBashCommands.get(chatId);
  if (pending && !pending.confirmed) {
    pending.confirmed = true;
    return true;
  }
  return false;
}

/**
 * Check if a pending command matches and is confirmed
 * @param {string|number} chatId - The chat ID
 * @param {string} command - The command to check
 * @returns {boolean} Whether the command is confirmed
 */
export function isBashCommandConfirmed(chatId, command) {
  const pending = getPendingBashCommand(chatId);
  if (pending && pending.confirmed && pending.command === command) {
    return true;
  }
  return false;
}

/**
 * Clear the pending bash command for a chat
 * @param {string|number} chatId - The chat ID
 */
export function clearPendingBashCommand(chatId) {
  pendingBashCommands.delete(chatId);
}

export function setNeedsReload() {
  needsReload = true;
}

export function checkAndClearReload() {
  const result = needsReload;
  needsReload = false;
  return result;
}

// Background tasks for async operations (image generation, etc.)
const backgroundTasks = new Map();
let taskIdCounter = 0;

// Pending photo notifications (chatId -> [{ buffer, caption, timestamp }])
const pendingPhotos = new Map();

// Last generated image per chat (for subsequent edits)
const lastGeneratedImage = new Map();

/**
 * Create a background task
 * @param {string|number} chatId - Chat to notify when complete
 * @param {string} type - Task type (e.g., 'image_generate')
 * @param {Object} metadata - Additional task data
 * @returns {string} Task ID
 */
export function createBackgroundTask(chatId, type, metadata = {}) {
  const taskId = `task_${++taskIdCounter}_${Date.now()}`;
  backgroundTasks.set(taskId, {
    type,
    chatId,
    status: 'pending',
    result: null,
    error: null,
    metadata,
    startedAt: Date.now(),
  });
  return taskId;
}

/**
 * Update a background task
 * @param {string} taskId - Task ID
 * @param {Object} updates - Fields to update
 */
export function updateBackgroundTask(taskId, updates) {
  const task = backgroundTasks.get(taskId);
  if (task) {
    Object.assign(task, updates);
  }
}

/**
 * Get a background task by ID
 * @param {string} taskId - Task ID
 * @returns {Object|undefined}
 */
export function getBackgroundTask(taskId) {
  return backgroundTasks.get(taskId);
}

/**
 * Queue a photo notification for a chat
 * @param {string|number} chatId - Chat ID
 * @param {Buffer} buffer - Image buffer
 * @param {string} caption - Photo caption
 */
export function addPhotoNotification(chatId, buffer, caption = '') {
  if (!pendingPhotos.has(chatId)) {
    pendingPhotos.set(chatId, []);
  }
  pendingPhotos.get(chatId).push({ buffer, caption, timestamp: Date.now() });
}

/**
 * Get and clear photo notifications for a chat
 * @param {string|number} chatId - Chat ID
 * @returns {Array} Pending photos
 */
export function getAndClearPhotoNotifications(chatId) {
  const photos = pendingPhotos.get(chatId) || [];
  pendingPhotos.delete(chatId);
  return photos;
}

/**
 * Get all chats with pending photos
 * @returns {Array} Chat IDs with pending photos
 */
export function getChatsWithPendingPhotos() {
  return Array.from(pendingPhotos.keys());
}

/**
 * Cleanup old background tasks (older than maxAge)
 * @param {number} maxAge - Max age in ms (default 30 minutes)
 */
export function cleanupBackgroundTasks(maxAge = 30 * 60 * 1000) {
  const now = Date.now();
  for (const [taskId, task] of backgroundTasks.entries()) {
    if (now - task.startedAt > maxAge) {
      backgroundTasks.delete(taskId);
    }
  }
}

/**
 * Store the last generated image for a chat (for subsequent edits)
 * @param {string|number} chatId - Chat ID
 * @param {Buffer} buffer - Image buffer
 */
export function setLastGeneratedImage(chatId, buffer) {
  lastGeneratedImage.set(chatId, {
    buffer,
    timestamp: Date.now(),
  });
}

/**
 * Get the last generated image for a chat
 * @param {string|number} chatId - Chat ID
 * @returns {Buffer|null}
 */
export function getLastGeneratedImage(chatId) {
  const entry = lastGeneratedImage.get(chatId);
  // Expire after 30 minutes
  if (entry && Date.now() - entry.timestamp > 30 * 60 * 1000) {
    lastGeneratedImage.delete(chatId);
    return null;
  }
  return entry?.buffer || null;
}

// Tool call log (persistent)
const toolLog = [];
const MAX_TOOL_LOG = 50;

// Claude Code sessions (sessionId -> session object)
const claudeSessions = new Map();

/**
 * Create a new Claude Code session
 * @param {string|number} chatId - Chat that owns this session
 * @param {Object} sessionData - Session data
 */
export function createClaudeSession(chatId, sessionData) {
  const session = {
    ...sessionData,
    chatId,
    startedAt: sessionData.startedAt || new Date().toISOString(),
    lastActivity: sessionData.lastActivity || new Date().toISOString(),
  };
  claudeSessions.set(session.id, session);
}

/**
 * Get a Claude session by ID
 * @param {string} sessionId - Session ID
 * @returns {Object|undefined}
 */
export function getClaudeSession(sessionId) {
  return claudeSessions.get(sessionId);
}

/**
 * Get all Claude sessions for a chat
 * @param {string|number} chatId - Chat ID
 * @returns {Array}
 */
export function getClaudeSessionsForChat(chatId) {
  const sessions = [];
  for (const session of claudeSessions.values()) {
    if (session.chatId === chatId) {
      sessions.push(session);
    }
  }
  return sessions;
}

/**
 * Get all Claude sessions
 * @returns {Map}
 */
export function getAllClaudeSessions() {
  return claudeSessions;
}

/**
 * Update a Claude session
 * @param {string} sessionId - Session ID
 * @param {Object} updates - Fields to update
 */
export function updateClaudeSession(sessionId, updates) {
  const session = claudeSessions.get(sessionId);
  if (session) {
    Object.assign(session, updates);
  }
}

/**
 * Remove a Claude session
 * @param {string} sessionId - Session ID
 */
export function removeClaudeSession(sessionId) {
  claudeSessions.delete(sessionId);
}

// Currently running tasks (for animated display)
const runningTasks = new Map();

export function addToolLog(entry) {
  toolLog.push({
    ...entry,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  });
  // Keep only last N entries
  if (toolLog.length > MAX_TOOL_LOG) {
    toolLog.shift();
  }
}

/**
 * Add a running task (for animated display)
 */
export function addRunningTask(id, description) {
  runningTasks.set(id, {
    description,
    startedAt: Date.now(),
  });
}

/**
 * Remove a running task
 */
export function removeRunningTask(id) {
  runningTasks.delete(id);
}

/**
 * Get all running tasks
 */
export function getRunningTasks() {
  return Array.from(runningTasks.entries()).map(([id, task]) => ({
    id,
    ...task,
  }));
}

export function getToolLog() {
  return [...toolLog];
}

export function clearToolLog() {
  toolLog.length = 0;
}

export function incrementProcessing() {
  processingCount++;
}

export function decrementProcessing() {
  processingCount--;
}

export function getProcessingCount() {
  return processingCount;
}

export function loadVerifiedUsers() {
  const config = loadConfig();
  if (config?.verifiedUsers) {
    for (const [chatId, phone] of Object.entries(config.verifiedUsers)) {
      verifiedUsers.set(Number(chatId), phone);
    }
  }
}

export function clearConversations() {
  conversations.clear();
}

export function clearVerifiedUsers() {
  verifiedUsers.clear();
}

export function getTokenCount() {
  let totalChars = 0;
  for (const history of conversations.values()) {
    for (const msg of history) {
      totalChars += (msg.content || '').length;
    }
  }
  return Math.round(totalChars / 4);
}
