import { jest } from '@jest/globals';
import { getAIResponse } from '../src/ai.js';
import { conversations } from '../src/state.js';

// Mock global fetch
global.fetch = jest.fn();

describe('ai', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    conversations.clear();
  });

  describe('getAIResponse', () => {
    const mockAnthropicConfig = {
      ai: {
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-opus-4-6',
        maxTokens: 4096,
        systemPrompt: 'You are a helpful assistant.'
      }
    };

    const mockOpenRouterConfig = {
      ai: {
        provider: 'openrouter',
        apiKey: 'test-key',
        model: 'google/gemini-2.0-flash-001',
        maxTokens: 4096,
        temperature: 0.7,
        systemPrompt: 'You are a helpful assistant.'
      }
    };

    it('should create conversation history for new chat', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Hello!' }]
        })
      });

      await getAIResponse(mockAnthropicConfig, 123, 'Hi');

      expect(conversations.has(123)).toBe(true);
      expect(conversations.get(123).length).toBe(2); // user + assistant
    });

    it('should add messages to existing conversation', async () => {
      conversations.set(456, [
        { role: 'user', content: 'Previous message' },
        { role: 'assistant', content: 'Previous response' }
      ]);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'New response' }]
        })
      });

      await getAIResponse(mockAnthropicConfig, 456, 'New message');

      expect(conversations.get(456).length).toBe(4);
    });

    it('should limit conversation history to 20 messages', async () => {
      // Create 25 messages
      const longHistory = [];
      for (let i = 0; i < 25; i++) {
        longHistory.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}` });
      }
      conversations.set(789, longHistory);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Response' }]
        })
      });

      await getAIResponse(mockAnthropicConfig, 789, 'New message');

      // Should be trimmed to 20 + new user + new assistant = still max ~22 after trim
      expect(conversations.get(789).length).toBeLessThanOrEqual(22);
    });

    it('should call Anthropic API with correct format', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Response' }]
        })
      });

      await getAIResponse(mockAnthropicConfig, 111, 'Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'test-key',
            'anthropic-version': '2023-06-01'
          })
        })
      );
    });

    it('should call OpenRouter API with correct format', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Response' } }]
        })
      });

      await getAIResponse(mockOpenRouterConfig, 222, 'Hello');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-key'
          })
        })
      );
    });

    it('should throw error for API failures', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized')
      });

      await expect(
        getAIResponse(mockAnthropicConfig, 333, 'Hello')
      ).rejects.toThrow('Anthropic API error: 401');
    });

    it('should throw error for unconfigured provider', async () => {
      const badConfig = { ai: { provider: 'unknown' } };

      await expect(
        getAIResponse(badConfig, 444, 'Hello')
      ).rejects.toThrow('No AI provider configured');
    });

    it('should return response text from Anthropic', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          content: [{ type: 'text', text: 'Hello from Claude!' }]
        })
      });

      const response = await getAIResponse(mockAnthropicConfig, 555, 'Hi');

      expect(response).toBe('Hello from Claude!');
    });

    it('should return response text from OpenRouter', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'Hello from Gemini!' } }]
        })
      });

      const response = await getAIResponse(mockOpenRouterConfig, 666, 'Hi');

      expect(response).toBe('Hello from Gemini!');
    });
  });
});
