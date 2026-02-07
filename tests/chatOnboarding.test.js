import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, '..', 'memory');

describe('chatOnboarding', () => {
  let needsOnboarding, processOnboarding, resetOnboarding;
  let getOnboardingState, saveOnboardingState, setBotName;

  // Use a unique chat ID for each test run to avoid state pollution
  const testChatId = Date.now();

  // Backup original memory files
  let userMdBackup = null;
  let soulMdBackup = null;

  beforeAll(async () => {
    // Backup memory files before tests
    const userMdPath = path.join(MEMORY_DIR, 'user.md');
    const soulMdPath = path.join(MEMORY_DIR, 'soul.md');

    if (fs.existsSync(userMdPath)) {
      userMdBackup = fs.readFileSync(userMdPath, 'utf-8');
    }
    if (fs.existsSync(soulMdPath)) {
      soulMdBackup = fs.readFileSync(soulMdPath, 'utf-8');
    }

    const onboarding = await import('../src/chatOnboarding.js');
    needsOnboarding = onboarding.needsOnboarding;
    processOnboarding = onboarding.processOnboarding;
    resetOnboarding = onboarding.resetOnboarding;

    const config = await import('../src/config.js');
    getOnboardingState = config.getOnboardingState;
    saveOnboardingState = config.saveOnboardingState;
    setBotName = config.setBotName;
  });

  afterAll(() => {
    // Clean up test onboarding state
    resetOnboarding(testChatId);
    resetOnboarding(testChatId + 1);
    resetOnboarding(testChatId + 2);

    // Restore memory files after tests
    const userMdPath = path.join(MEMORY_DIR, 'user.md');
    const soulMdPath = path.join(MEMORY_DIR, 'soul.md');

    if (userMdBackup !== null) {
      fs.writeFileSync(userMdPath, userMdBackup, 'utf-8');
    }
    if (soulMdBackup !== null) {
      fs.writeFileSync(soulMdPath, soulMdBackup, 'utf-8');
    }
  });

  describe('needsOnboarding', () => {
    it('should return true for new user', () => {
      expect(needsOnboarding(testChatId + 100)).toBe(true);
    });

    it('should return false after onboarding complete', () => {
      const chatId = testChatId + 101;
      saveOnboardingState(chatId, { step: 5, complete: true, data: {} });
      expect(needsOnboarding(chatId)).toBe(false);
      // Clean up
      resetOnboarding(chatId);
    });
  });

  describe('processOnboarding flow', () => {
    const chatId = testChatId;

    it('should walk through complete onboarding flow', () => {
      // Step 0 -> 1: Initial greeting
      let result = processOnboarding(chatId, '');
      expect(result.complete).toBe(false);
      expect(result.message).toContain('what should I call myself');

      // Step 1 -> 2: User provides bot name
      result = processOnboarding(chatId, 'TestBot');
      expect(result.complete).toBe(false);
      expect(result.message).toContain('TestBot');
      expect(result.message.toLowerCase()).toContain('where');

      // Step 2 -> 3: User provides location
      result = processOnboarding(chatId, 'New York');
      expect(result.complete).toBe(false);
      expect(result.message.toLowerCase()).toContain('name');

      // Step 3 -> 4: User provides their name
      result = processOnboarding(chatId, 'TestUser');
      expect(result.complete).toBe(false);
      expect(result.message).toContain('TestUser');
      expect(result.message.toLowerCase()).toContain('personality');

      // Step 4 -> 5: User provides personality (or skips)
      result = processOnboarding(chatId, 'Be helpful');
      expect(result.complete).toBe(true);
      expect(result.message.toLowerCase()).toContain('set');
    });

    it('should handle "nope" for personality preference', () => {
      const chatId2 = testChatId + 1;

      processOnboarding(chatId2, ''); // greeting
      processOnboarding(chatId2, 'Bot2'); // bot name
      processOnboarding(chatId2, 'LA'); // location
      processOnboarding(chatId2, 'User2'); // user name

      const result = processOnboarding(chatId2, 'nope');
      expect(result.complete).toBe(true);
    });
  });

  describe('resetOnboarding', () => {
    it('should reset onboarding state', () => {
      const chatId = testChatId + 2;

      // Start onboarding
      processOnboarding(chatId, '');
      processOnboarding(chatId, 'ResetBot');

      // State should be progressed
      let state = getOnboardingState(chatId);
      expect(state.step).toBeGreaterThan(1);

      // Reset
      resetOnboarding(chatId);

      // State should be reset
      state = getOnboardingState(chatId);
      expect(state.step).toBe(0);
      expect(state.complete).toBe(false);
    });
  });
});
