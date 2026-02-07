/**
 * Web search tool tests
 */

import { jest } from '@jest/globals';

// Mock fetch globally
global.fetch = jest.fn();

describe('Web Cache', () => {
  let cache;

  beforeEach(async () => {
    // Reset modules to get fresh cache
    jest.resetModules();
    cache = await import('../src/tools/web/cache.js');
  });

  it('should store and retrieve cached values', () => {
    cache.setCache('test-key', { data: 'test-value' });
    const result = cache.getCached('test-key');
    expect(result).toEqual({ data: 'test-value' });
  });

  it('should return null for missing keys', () => {
    const result = cache.getCached('nonexistent');
    expect(result).toBeNull();
  });

  it('should expire entries after TTL', async () => {
    // Set with very short TTL (10ms)
    cache.setCache('short-ttl', 'value', 10);
    expect(cache.getCached('short-ttl')).toBe('value');

    // Wait for expiry
    await new Promise(r => setTimeout(r, 20));
    expect(cache.getCached('short-ttl')).toBeNull();
  });

  it('should clear all cache entries', () => {
    cache.setCache('key1', 'value1');
    cache.setCache('key2', 'value2');
    cache.clearCache();
    expect(cache.getCached('key1')).toBeNull();
    expect(cache.getCached('key2')).toBeNull();
  });

  it('should report cache stats', () => {
    cache.setCache('key1', 'value1');
    cache.setCache('key2', 'value2');
    const stats = cache.getCacheStats();
    expect(stats.entries).toBe(2);
    expect(stats.keys).toContain('key1');
    expect(stats.keys).toContain('key2');
  });
});

describe('Web Client - braveSearch', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch.mockReset();
    // Clear the cache module to reset its state
    const cache = await import('../src/tools/web/cache.js');
    cache.clearCache();
  });

  it('should make search request with correct parameters', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: 'Test Result',
              url: 'https://example.com/test',
              description: 'Test description',
              page_age: '2024-01-01',
            },
          ],
        },
      }),
    });

    const { braveSearch } = await import('../src/tools/web/client.js');
    await braveSearch({
      query: 'test query',
      apiKey: 'test-key',
      count: 5,
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('api.search.brave.com');
    expect(url).toContain('q=test+query');
    expect(url).toContain('count=5');
    expect(options.headers['X-Subscription-Token']).toBe('test-key');
  });

  it('should return formatted search results', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            {
              title: 'React 19 Features',
              url: 'https://react.dev/blog',
              description: 'New features in React 19',
              page_age: '2026-01-15',
            },
          ],
        },
      }),
    });

    const { braveSearch } = await import('../src/tools/web/client.js');
    const result = await braveSearch({
      query: 'React 19',
      apiKey: 'test-key',
    });

    expect(result.query).toBe('React 19');
    expect(result.totalResults).toBe(1);
    expect(result.results[0]).toEqual({
      title: 'React 19 Features',
      url: 'https://react.dev/blog',
      description: 'New features in React 19',
      pageAge: '2026-01-15',
      favicon: null,
    });
  });

  it('should throw error for missing API key', async () => {
    const { braveSearch } = await import('../src/tools/web/client.js');
    await expect(braveSearch({
      query: 'test',
      apiKey: null,
    })).rejects.toThrow('API key not configured');
  });

  it('should throw error for empty query', async () => {
    const { braveSearch } = await import('../src/tools/web/client.js');
    await expect(braveSearch({
      query: '',
      apiKey: 'test-key',
    })).rejects.toThrow('query cannot be empty');
  });

  it('should handle 401 unauthorized error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const { braveSearch } = await import('../src/tools/web/client.js');
    await expect(braveSearch({
      query: 'test',
      apiKey: 'invalid-key',
    })).rejects.toThrow('Invalid Brave Search API key');
  });

  it('should handle 429 rate limit error', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => 'Rate limited',
    });

    const { braveSearch } = await import('../src/tools/web/client.js');
    await expect(braveSearch({
      query: 'test',
      apiKey: 'test-key',
    })).rejects.toThrow('rate limit exceeded');
  });

  it('should filter results by allowed domains', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'GitHub', url: 'https://github.com/test', description: 'GitHub result' },
            { title: 'Other', url: 'https://example.com/test', description: 'Other result' },
          ],
        },
      }),
    });

    const { braveSearch } = await import('../src/tools/web/client.js');
    const result = await braveSearch({
      query: 'test',
      apiKey: 'test-key',
      allowedDomains: ['github.com'],
    });

    expect(result.totalResults).toBe(1);
    expect(result.results[0].url).toBe('https://github.com/test');
  });

  it('should filter out blocked domains', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'Good', url: 'https://good.com/test', description: 'Good result' },
            { title: 'Bad', url: 'https://pinterest.com/test', description: 'Bad result' },
          ],
        },
      }),
    });

    const { braveSearch } = await import('../src/tools/web/client.js');
    const result = await braveSearch({
      query: 'test',
      apiKey: 'test-key',
      blockedDomains: ['pinterest.com'],
    });

    expect(result.totalResults).toBe(1);
    expect(result.results[0].url).toBe('https://good.com/test');
  });
});

describe('Web Client - fetchUrl', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch.mockReset();
    // Clear cache
    const cache = await import('../src/tools/web/cache.js');
    cache.clearCache();
  });

  it('should fetch and extract content from URL', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/page',
      headers: new Map([['content-type', 'text/html']]),
      text: async () => '<html><head><title>Test Page</title></head><body><p>Hello World</p></body></html>',
    });

    const { fetchUrl } = await import('../src/tools/web/client.js');
    const result = await fetchUrl({
      url: 'https://example.com/page',
      prompt: 'Extract content',
    });

    expect(result.url).toBe('https://example.com/page');
    expect(result.title).toBe('Test Page');
    expect(result.content).toContain('Hello World');
  });

  it('should upgrade HTTP to HTTPS', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://example.com/page',
      headers: new Map([['content-type', 'text/plain']]),
      text: async () => 'Content',
    });

    const { fetchUrl } = await import('../src/tools/web/client.js');
    await fetchUrl({ url: 'http://example.com/page' });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/page',
      expect.any(Object)
    );
  });

  it('should throw error for invalid URL', async () => {
    const { fetchUrl } = await import('../src/tools/web/client.js');
    await expect(fetchUrl({
      url: 'not-a-valid-url',
    })).rejects.toThrow('Invalid URL');
  });

  it('should detect cross-host redirects', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      url: 'https://different-host.com/page', // Different from original
      headers: new Map([['content-type', 'text/html']]),
      text: async () => 'Content',
    });

    const { fetchUrl } = await import('../src/tools/web/client.js');
    const result = await fetchUrl({
      url: 'https://example.com/page',
    });

    expect(result.redirect).toBe(true);
    expect(result.originalUrl).toBe('https://example.com/page');
    expect(result.redirectUrl).toBe('https://different-host.com/page');
  });

  it('should handle fetch errors', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      url: 'https://example.com/missing',
    });

    const { fetchUrl } = await import('../src/tools/web/client.js');
    await expect(fetchUrl({
      url: 'https://example.com/missing',
    })).rejects.toThrow('Failed to fetch URL: 404 Not Found');
  });
});

describe('Web Tools Integration', () => {
  beforeEach(async () => {
    jest.resetModules();
    global.fetch.mockReset();
  });

  it('should export web_search and web_fetch tools', async () => {
    const { webTools } = await import('../src/tools/web/index.js');
    expect(webTools).toHaveLength(2);
    expect(webTools.map(t => t.name)).toContain('web_search');
    expect(webTools.map(t => t.name)).toContain('web_fetch');
  });

  it('should have correct parameter schemas', async () => {
    const { webTools } = await import('../src/tools/web/index.js');
    const searchTool = webTools.find(t => t.name === 'web_search');
    expect(searchTool.parameters.properties.query).toBeDefined();
    expect(searchTool.parameters.required).toContain('query');

    const fetchTool = webTools.find(t => t.name === 'web_fetch');
    expect(fetchTool.parameters.properties.url).toBeDefined();
    expect(fetchTool.parameters.required).toContain('url');
  });
});
