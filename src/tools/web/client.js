/**
 * Web search and fetch clients
 * Uses Brave Search API for web searches
 */

import { getCached, setCache } from './cache.js';

const BRAVE_SEARCH_API = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Perform a web search using Brave Search API
 * @param {Object} options - Search options
 * @param {string} options.query - Search query
 * @param {string} options.apiKey - Brave Search API key
 * @param {number} options.count - Number of results (default: 10, max: 20)
 * @param {string[]} options.allowedDomains - Only include results from these domains
 * @param {string[]} options.blockedDomains - Exclude results from these domains
 * @param {string} options.country - Country code for localized results (e.g., 'US')
 * @returns {Promise<Object>} - Search results
 */
export async function braveSearch(options) {
  const {
    query,
    apiKey,
    count = 10,
    allowedDomains = [],
    blockedDomains = [],
    country = 'US',
  } = options;

  if (!apiKey) {
    throw new Error('Brave Search API key not configured. Run "web" command to set it up.');
  }

  if (!query || !query.trim()) {
    throw new Error('Search query cannot be empty');
  }

  // Check cache first
  const cacheKey = `search:${query}:${count}:${allowedDomains.join(',')}:${blockedDomains.join(',')}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  // Build search URL with parameters
  const params = new URLSearchParams({
    q: query.trim(),
    count: Math.min(count, 20).toString(),
    country,
    search_lang: 'en',
    text_decorations: 'false',
  });

  const response = await fetch(`${BRAVE_SEARCH_API}?${params}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    if (response.status === 401) {
      throw new Error('Invalid Brave Search API key. Run "web" command to update it.');
    }
    if (response.status === 429) {
      throw new Error('Brave Search rate limit exceeded. Please try again later.');
    }
    throw new Error(`Brave Search API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Process results
  let results = (data.web?.results || []).map(result => ({
    title: result.title,
    url: result.url,
    description: result.description,
    pageAge: result.page_age || null,
    favicon: result.meta_url?.favicon || null,
  }));

  // Apply domain filtering
  if (allowedDomains.length > 0) {
    results = results.filter(r => {
      const hostname = new URL(r.url).hostname.replace(/^www\./, '');
      return allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d));
    });
  }

  if (blockedDomains.length > 0) {
    results = results.filter(r => {
      const hostname = new URL(r.url).hostname.replace(/^www\./, '');
      return !blockedDomains.some(d => hostname === d || hostname.endsWith('.' + d));
    });
  }

  const searchResults = {
    query: query.trim(),
    totalResults: results.length,
    results,
    searchedAt: new Date().toISOString(),
  };

  // Cache results for 15 minutes
  setCache(cacheKey, searchResults);

  return searchResults;
}

/**
 * Fetch and extract content from a URL
 * @param {Object} options - Fetch options
 * @param {string} options.url - URL to fetch
 * @param {string} options.prompt - What information to extract
 * @param {number} options.maxLength - Maximum content length (default: 100000)
 * @returns {Promise<Object>} - Extracted content
 */
export async function fetchUrl(options) {
  const { url, prompt, maxLength = 100000 } = options;

  if (!url) {
    throw new Error('URL is required');
  }

  // Validate URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
    // Upgrade HTTP to HTTPS
    if (parsedUrl.protocol === 'http:') {
      parsedUrl.protocol = 'https:';
    }
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Check cache first
  const cacheKey = `fetch:${parsedUrl.href}`;
  const cached = getCached(cacheKey);
  if (cached) {
    return {
      ...cached,
      fromCache: true,
      prompt,
    };
  }

  // Fetch the URL
  const response = await fetch(parsedUrl.href, {
    method: 'GET',
    headers: {
      'User-Agent': 'DwightBot/1.0 (Web Fetcher)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  });

  // Check for cross-host redirect
  const finalUrl = response.url;
  const finalHostname = new URL(finalUrl).hostname;
  const originalHostname = parsedUrl.hostname;

  if (finalHostname !== originalHostname) {
    return {
      redirect: true,
      originalUrl: parsedUrl.href,
      redirectUrl: finalUrl,
      message: `URL redirected to a different host. Please fetch: ${finalUrl}`,
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || '';
  let content = await response.text();

  // Extract title before HTML conversion (since htmlToText removes <title>)
  const title = extractTitle(content);

  // Truncate if too long
  if (content.length > maxLength) {
    content = content.substring(0, maxLength) + '\n\n[Content truncated...]';
  }

  // Basic HTML to text conversion
  if (contentType.includes('text/html')) {
    content = htmlToText(content);
  }

  const fetchResult = {
    url: finalUrl,
    title,
    content: content.substring(0, maxLength),
    contentType,
    fetchedAt: new Date().toISOString(),
  };

  // Cache for 15 minutes
  setCache(cacheKey, fetchResult);

  return {
    ...fetchResult,
    prompt,
  };
}

/**
 * Basic HTML to text conversion
 */
function htmlToText(html) {
  // Remove scripts and styles
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Convert common tags to newlines
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text.replace(/\n\s*\n/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.trim();

  return text;
}

/**
 * Extract title from HTML
 */
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}
