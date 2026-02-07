import {
  conversations,
  verifiedUsers,
  incrementProcessing,
  decrementProcessing,
  getProcessingCount,
  clearConversations,
  clearVerifiedUsers,
  getTokenCount,
  setPendingBashCommand,
  getPendingBashCommand,
  confirmPendingBashCommand,
  isBashCommandConfirmed,
  clearPendingBashCommand,
} from '../src/state.js';

describe('state', () => {
  beforeEach(() => {
    // Clear state before each test
    conversations.clear();
    verifiedUsers.clear();
    // Reset processing count
    while (getProcessingCount() > 0) {
      decrementProcessing();
    }
  });

  describe('conversations', () => {
    it('should be a Map', () => {
      expect(conversations instanceof Map).toBe(true);
    });

    it('should start empty', () => {
      expect(conversations.size).toBe(0);
    });

    it('should store conversation history', () => {
      const chatId = 123;
      conversations.set(chatId, [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ]);
      expect(conversations.has(chatId)).toBe(true);
      expect(conversations.get(chatId).length).toBe(2);
    });
  });

  describe('verifiedUsers', () => {
    it('should be a Map', () => {
      expect(verifiedUsers instanceof Map).toBe(true);
    });

    it('should store verified phone numbers', () => {
      verifiedUsers.set(123, '+1234567890');
      expect(verifiedUsers.has(123)).toBe(true);
      expect(verifiedUsers.get(123)).toBe('+1234567890');
    });
  });

  describe('processing count', () => {
    it('should start at 0', () => {
      expect(getProcessingCount()).toBe(0);
    });

    it('should increment', () => {
      incrementProcessing();
      expect(getProcessingCount()).toBe(1);
      incrementProcessing();
      expect(getProcessingCount()).toBe(2);
    });

    it('should decrement', () => {
      incrementProcessing();
      incrementProcessing();
      decrementProcessing();
      expect(getProcessingCount()).toBe(1);
    });
  });

  describe('clearConversations', () => {
    it('should clear all conversations', () => {
      conversations.set(1, [{ role: 'user', content: 'test' }]);
      conversations.set(2, [{ role: 'user', content: 'test2' }]);
      expect(conversations.size).toBe(2);

      clearConversations();
      expect(conversations.size).toBe(0);
    });
  });

  describe('clearVerifiedUsers', () => {
    it('should clear all verified users', () => {
      verifiedUsers.set(1, '+123');
      verifiedUsers.set(2, '+456');
      expect(verifiedUsers.size).toBe(2);

      clearVerifiedUsers();
      expect(verifiedUsers.size).toBe(0);
    });
  });

  describe('getTokenCount', () => {
    it('should return 0 for empty conversations', () => {
      expect(getTokenCount()).toBe(0);
    });

    it('should estimate tokens from conversation content', () => {
      // ~4 chars per token
      conversations.set(1, [
        { role: 'user', content: 'Hello world' }, // 11 chars
        { role: 'assistant', content: 'Hi there!' } // 9 chars
      ]);
      // Total: 20 chars / 4 = 5 tokens
      expect(getTokenCount()).toBe(5);
    });

    it('should count across multiple conversations', () => {
      conversations.set(1, [{ role: 'user', content: '12345678' }]); // 8 chars = 2 tokens
      conversations.set(2, [{ role: 'user', content: '12345678' }]); // 8 chars = 2 tokens
      expect(getTokenCount()).toBe(4);
    });

    it('should handle empty content gracefully', () => {
      conversations.set(1, [{ role: 'user', content: '' }]);
      conversations.set(2, [{ role: 'user' }]); // no content property
      expect(getTokenCount()).toBe(0);
    });
  });

  describe('pending bash commands', () => {
    const chatId = 12345;
    const testCommand = {
      command: 'npm install -g typescript',
      reason: 'Installing global npm packages',
      description: 'Install TypeScript globally',
    };

    beforeEach(() => {
      clearPendingBashCommand(chatId);
    });

    it('should set a pending bash command', () => {
      setPendingBashCommand(chatId, testCommand);
      const pending = getPendingBashCommand(chatId);
      expect(pending).toBeDefined();
      expect(pending.command).toBe(testCommand.command);
      expect(pending.reason).toBe(testCommand.reason);
      expect(pending.confirmed).toBe(false);
    });

    it('should return null for non-existent pending command', () => {
      const pending = getPendingBashCommand(99999);
      expect(pending).toBeNull();
    });

    it('should confirm a pending command', () => {
      setPendingBashCommand(chatId, testCommand);
      const confirmed = confirmPendingBashCommand(chatId);
      expect(confirmed).toBe(true);

      const pending = getPendingBashCommand(chatId);
      expect(pending.confirmed).toBe(true);
    });

    it('should not confirm twice', () => {
      setPendingBashCommand(chatId, testCommand);
      confirmPendingBashCommand(chatId);
      const secondConfirm = confirmPendingBashCommand(chatId);
      expect(secondConfirm).toBe(false);
    });

    it('should check if command is confirmed', () => {
      setPendingBashCommand(chatId, testCommand);

      // Not confirmed yet
      expect(isBashCommandConfirmed(chatId, testCommand.command)).toBe(false);

      // After confirmation
      confirmPendingBashCommand(chatId);
      expect(isBashCommandConfirmed(chatId, testCommand.command)).toBe(true);

      // Wrong command
      expect(isBashCommandConfirmed(chatId, 'different command')).toBe(false);
    });

    it('should clear pending command', () => {
      setPendingBashCommand(chatId, testCommand);
      clearPendingBashCommand(chatId);
      const pending = getPendingBashCommand(chatId);
      expect(pending).toBeNull();
    });

    it('should return false when confirming non-existent command', () => {
      const confirmed = confirmPendingBashCommand(99999);
      expect(confirmed).toBe(false);
    });
  });
});
