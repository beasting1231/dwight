import fs from 'fs';
import { jest } from '@jest/globals';
import {
  loadConfig,
  saveConfig,
  resetConfig,
  loadStoredKeys,
  saveApiKey,
  saveVerifiedUser,
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
});
