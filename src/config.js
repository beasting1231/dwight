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
