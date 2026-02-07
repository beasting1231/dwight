import { MODELS, getModelShortName } from '../src/models.js';

describe('models', () => {
  describe('MODELS', () => {
    it('should have anthropic provider with models', () => {
      expect(MODELS.anthropic).toBeDefined();
      expect(Array.isArray(MODELS.anthropic)).toBe(true);
      expect(MODELS.anthropic.length).toBeGreaterThan(0);
    });

    it('should have openrouter provider with models', () => {
      expect(MODELS.openrouter).toBeDefined();
      expect(Array.isArray(MODELS.openrouter)).toBe(true);
      expect(MODELS.openrouter.length).toBeGreaterThan(0);
    });

    it('each model should have required properties', () => {
      const allModels = [...MODELS.anthropic, ...MODELS.openrouter];
      allModels.forEach(model => {
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('value');
        expect(model).toHaveProperty('pricing');
        expect(typeof model.name).toBe('string');
        expect(typeof model.value).toBe('string');
        expect(typeof model.pricing).toBe('string');
      });
    });
  });

  describe('getModelShortName', () => {
    it('should return "Not set" for null/undefined', () => {
      expect(getModelShortName(null)).toBe('Not set');
      expect(getModelShortName(undefined)).toBe('Not set');
    });

    it('should shorten Gemini 2.0 Flash model name', () => {
      expect(getModelShortName('google/gemini-2.0-flash-001')).toBe('Gemini 2.0 Flash');
    });

    it('should shorten Gemini 2.0 Flash Lite model name', () => {
      expect(getModelShortName('google/gemini-2.0-flash-lite-001')).toBe('Gemini 2.0 Lite');
    });

    it('should shorten Claude Opus model name', () => {
      expect(getModelShortName('anthropic/claude-opus-4.6')).toBe('Claude Opus');
      expect(getModelShortName('claude-opus-4-6')).toBe('Claude Opus');
    });

    it('should shorten Claude Sonnet model name', () => {
      expect(getModelShortName('anthropic/claude-sonnet-4.5')).toBe('Claude Sonnet');
    });

    it('should shorten Claude Haiku model name', () => {
      expect(getModelShortName('claude-haiku-4-5')).toBe('Claude Haiku');
    });

    it('should shorten GPT-5 model names', () => {
      expect(getModelShortName('openai/gpt-5.2-pro')).toBe('GPT-5.2 Pro');
      expect(getModelShortName('openai/gpt-5.1')).toBe('GPT-5.1');
    });

    it('should shorten DeepSeek model name', () => {
      expect(getModelShortName('deepseek/deepseek-v3.2')).toBe('DeepSeek');
    });

    it('should shorten Llama model name', () => {
      expect(getModelShortName('meta-llama/llama-3.3-70b-instruct:free')).toBe('Llama 3.3');
    });

    it('should truncate unknown model names to 20 chars', () => {
      const longName = 'some-provider/very-long-model-name-that-exceeds-twenty-characters';
      const result = getModelShortName(longName);
      expect(result.length).toBeLessThanOrEqual(20);
    });
  });
});
