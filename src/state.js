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

export function setPendingEmail(chatId, emailData) {
  pendingEmails.set(chatId, { ...emailData, timestamp: Date.now() });
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

export function clearPendingEmail(chatId) {
  pendingEmails.delete(chatId);
}

export function setNeedsReload() {
  needsReload = true;
}

export function checkAndClearReload() {
  const result = needsReload;
  needsReload = false;
  return result;
}

// Tool call log (persistent)
const toolLog = [];
const MAX_TOOL_LOG = 50;

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
