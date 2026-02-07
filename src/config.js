import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {
    return null;
  }
  return null;
}

export function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function resetConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
    return true;
  }
  return false;
}

export function loadStoredKeys() {
  const config = loadConfig();
  const keys = { ...(config?.apiKeys || {}) };

  // Also include the current active API key
  if (config?.ai?.provider && config?.ai?.apiKey) {
    keys[config.ai.provider] = config.ai.apiKey;
  }

  return keys;
}

export function saveApiKey(provider, apiKey) {
  const config = loadConfig() || {};
  config.apiKeys = config.apiKeys || {};
  config.apiKeys[provider] = apiKey;
  saveConfig(config);
}

export function saveVerifiedUser(chatId, phone) {
  const config = loadConfig() || {};
  config.verifiedUsers = config.verifiedUsers || {};
  config.verifiedUsers[chatId] = phone;
  saveConfig(config);
}

/**
 * Get the current file operation mode
 * @returns {'ask' | 'auto'} The current mode
 */
export function getFileMode() {
  const config = loadConfig();
  return config?.fileMode || 'ask';
}

/**
 * Check if user onboarding is complete
 * @param {string|number} chatId - The chat ID
 * @returns {boolean}
 */
export function isOnboardingComplete(chatId) {
  const config = loadConfig();
  return config?.onboarding?.[chatId]?.complete === true;
}

/**
 * Get onboarding state for a user
 * @param {string|number} chatId - The chat ID
 * @returns {Object}
 */
export function getOnboardingState(chatId) {
  const config = loadConfig();
  return config?.onboarding?.[chatId] || { step: 0, complete: false, data: {} };
}

/**
 * Save onboarding state for a user
 * @param {string|number} chatId - The chat ID
 * @param {Object} state - The onboarding state
 */
export function saveOnboardingState(chatId, state) {
  const config = loadConfig() || {};
  config.onboarding = config.onboarding || {};
  config.onboarding[chatId] = state;
  saveConfig(config);
}

/**
 * Update bot name in config
 * @param {string} name - The new bot name
 */
export function setBotName(name) {
  const config = loadConfig() || {};
  config.telegram = config.telegram || {};
  config.telegram.name = name;
  saveConfig(config);
}

/**
 * Set the file operation mode
 * @param {'ask' | 'auto'} mode - The mode to set
 */
export function setFileMode(mode) {
  const config = loadConfig() || {};
  config.fileMode = mode;
  saveConfig(config);
}

/**
 * Get the current bash operation mode
 * @returns {'ask' | 'auto'} The current mode
 */
export function getBashMode() {
  const config = loadConfig();
  return config?.bashMode || 'ask';
}

/**
 * Set the bash operation mode
 * @param {'ask' | 'auto'} mode - The mode to set
 */
export function setBashMode(mode) {
  const config = loadConfig() || {};
  config.bashMode = mode;
  saveConfig(config);
}
