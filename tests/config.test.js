import fs from 'fs';
import { jest } from '@jest/globals';
import {
  loadConfig,
  saveConfig,
  resetConfig,
  loadStoredKeys,
  saveApiKey,
  saveVerifiedUser,
  getFileMode,
  setFileMode,
  getSessions,
  addSession,
  removeSession,
  isSession,
  CONFIG_PATH
} from '../src/config.js';

// Mock fs module
jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe('config', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CONFIG_PATH', () => {
    it('should be defined and end with config.json', () => {
      expect(CONFIG_PATH).toBeDefined();
      expect(CONFIG_PATH.endsWith('config.json')).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('should return null if config file does not exist', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      const result = loadConfig();
      expect(result).toBeNull();
    });

    it('should return parsed config if file exists', () => {
      const mockConfig = { telegram: { token: 'test' } };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      const result = loadConfig();
      expect(result).toEqual(mockConfig);
    });

    it('should return null on parse error', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue('invalid json');

      const result = loadConfig();
      expect(result).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('should write config as JSON', () => {
      fs.writeFileSync = jest.fn();
      const config = { test: 'value' };

      saveConfig(config);

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        CONFIG_PATH,
        JSON.stringify(config, null, 2)
      );
    });
  });

  describe('resetConfig', () => {
    it('should delete config file if it exists', () => {
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.unlinkSync = jest.fn();

      const result = resetConfig();

      expect(fs.unlinkSync).toHaveBeenCalledWith(CONFIG_PATH);
      expect(result).toBe(true);
    });

    it('should return false if config file does not exist', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);

      const result = resetConfig();

      expect(result).toBe(false);
    });
  });

  describe('loadStoredKeys', () => {
    it('should return empty object if no config', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);

      const result = loadStoredKeys();

      expect(result).toEqual({});
    });

    it('should return apiKeys from config', () => {
      const mockConfig = {
        apiKeys: { openrouter: 'key1', anthropic: 'key2' }
      };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      const result = loadStoredKeys();

      expect(result).toEqual(mockConfig.apiKeys);
    });

    it('should include active API key from config.ai', () => {
      const mockConfig = {
        ai: { provider: 'openrouter', apiKey: 'active-key' },
        apiKeys: {}
      };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      const result = loadStoredKeys();

      expect(result.openrouter).toBe('active-key');
    });
  });

  describe('saveApiKey', () => {
    it('should add API key to config.apiKeys', () => {
      const existingConfig = { telegram: { token: 'test' } };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      saveApiKey('openrouter', 'new-key');

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.apiKeys.openrouter).toBe('new-key');
    });
  });

  describe('saveVerifiedUser', () => {
    it('should add verified user to config', () => {
      const existingConfig = { telegram: { token: 'test' } };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      saveVerifiedUser(123456, '+1234567890');

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.verifiedUsers['123456']).toBe('+1234567890');
    });
  });

  describe('getFileMode', () => {
    it('should return "ask" as default when no config exists', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);

      const result = getFileMode();

      expect(result).toBe('ask');
    });

    it('should return "ask" when fileMode is not set', () => {
      const mockConfig = { telegram: { token: 'test' } };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      const result = getFileMode();

      expect(result).toBe('ask');
    });

    it('should return configured fileMode', () => {
      const mockConfig = { fileMode: 'auto' };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      const result = getFileMode();

      expect(result).toBe('auto');
    });
  });

  describe('setFileMode', () => {
    it('should set fileMode to "auto"', () => {
      const existingConfig = { telegram: { token: 'test' } };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      setFileMode('auto');

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.fileMode).toBe('auto');
    });

    it('should set fileMode to "ask"', () => {
      const existingConfig = { fileMode: 'auto' };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      setFileMode('ask');

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.fileMode).toBe('ask');
    });
  });

  describe('getSessions', () => {
    it('should return empty array when no sessions exist', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      expect(getSessions()).toEqual([]);
    });

    it('should return sessions from config', () => {
      const mockConfig = { sessions: [{ chatId: -100123, name: 'Work', createdAt: '2026-01-01' }] };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));
      expect(getSessions()).toEqual(mockConfig.sessions);
    });
  });

  describe('addSession', () => {
    it('should add a new session to config', () => {
      const existingConfig = { telegram: { token: 'test' } };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      addSession(-100123, 'Work');

      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.sessions).toHaveLength(1);
      expect(savedConfig.sessions[0].chatId).toBe(-100123);
      expect(savedConfig.sessions[0].name).toBe('Work');
      expect(savedConfig.sessions[0].createdAt).toBeDefined();
    });

    it('should not add duplicate session', () => {
      const existingConfig = { sessions: [{ chatId: -100123, name: 'Work', createdAt: '2026-01-01' }] };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      addSession(-100123, 'Work Again');

      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('removeSession', () => {
    it('should remove an existing session', () => {
      const existingConfig = { sessions: [{ chatId: -100123, name: 'Work', createdAt: '2026-01-01' }] };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      const result = removeSession(-100123);

      expect(result).toBe(true);
      const savedConfig = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(savedConfig.sessions).toHaveLength(0);
    });

    it('should return false when session does not exist', () => {
      const existingConfig = { sessions: [] };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(existingConfig));
      fs.writeFileSync = jest.fn();

      const result = removeSession(-999);

      expect(result).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('isSession', () => {
    it('should return true for a registered session', () => {
      const mockConfig = { sessions: [{ chatId: -100123, name: 'Work', createdAt: '2026-01-01' }] };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      expect(isSession(-100123)).toBe(true);
    });

    it('should return false for an unregistered chatId', () => {
      const mockConfig = { sessions: [] };
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(JSON.stringify(mockConfig));

      expect(isSession(-999)).toBe(false);
    });

    it('should return false when no config exists', () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      expect(isSession(-100123)).toBe(false);
    });
  });
});
