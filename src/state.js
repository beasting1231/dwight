import { loadConfig } from './config.js';

// Conversation history per chat
export const conversations = new Map();

// Verified users (chatId -> phone number)
export const verifiedUsers = new Map();

// Processing state
export let processingCount = 0;

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
