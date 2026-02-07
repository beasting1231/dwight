/**
 * Web search and fetch actions
 */

import { braveSearch, fetchUrl } from './client.js';
import { loadConfig } from '../../config.js';

/**
 * Get Brave API key from config
 */
function getBraveApiKey() {
  const config = loadConfig();
  return config?.web?.braveApiKey;
}

/**
 * Get current date for search context
 */
function getCurrentDate() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.toLocaleString('en-US', { month: 'long' }),
    day: now.getDate(),
    formatted: now.toISOString().split('T')[0],
  };
}

/**
 * Search the web using Brave Search
 * @param {Object} params - Search parameters
 * @param {string} params.query - Search query
 * @param {number} params.count - Number of results (max 20)
 * @param {string[]} params.allowedDomains - Only include these domains
 * @param {string[]} params.blockedDomains - Exclude these domains
 * @returns {Promise<Object>} - Search results with sources
 */
export async function searchWeb(params) {
  const apiKey = getBraveApiKey();

  if (!apiKey) {
    return {
      error: 'Web search not configured. Ask the user to run the "web" command in the CLI to set up the Brave Search API key.',
    };
  }

  const date = getCurrentDate();

  try {
    const results = await braveSearch({
      query: params.query,
      apiKey,
      count: params.count || 10,
      allowedDomains: params.allowedDomains || [],
      blockedDomains: params.blockedDomains || [],
    });

    // Format results for AI consumption
    return {
      success: true,
      query: results.query,
      searchDate: date.formatted,
      currentYear: date.year,
      totalResults: results.totalResults,
      results: results.results.map((r, i) => ({
        rank: i + 1,
        title: r.title,
        url: r.url,
        description: r.description,
        pageAge: r.pageAge,
      })),
      fromCache: results.fromCache || false,
      instruction: 'IMPORTANT: After answering, include a "Sources:" section listing relevant URLs as markdown links.',
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Fetch content from a specific URL
 * @param {Object} params - Fetch parameters
 * @param {string} params.url - URL to fetch
 * @param {string} params.prompt - What to extract from the page
 * @returns {Promise<Object>} - Page content
 */
export async function fetchWebPage(params) {
  if (!params.url) {
    return { error: 'URL is required' };
  }

  try {
    const result = await fetchUrl({
      url: params.url,
      prompt: params.prompt || 'Extract the main content from this page',
      maxLength: 50000, // Limit content size
    });

    // Handle redirects
    if (result.redirect) {
      return {
        redirect: true,
        originalUrl: result.originalUrl,
        redirectUrl: result.redirectUrl,
        instruction: `The URL redirected to a different host. Make a new web_fetch request with: ${result.redirectUrl}`,
      };
    }

    return {
      success: true,
      url: result.url,
      title: result.title,
      content: result.content,
      contentType: result.contentType,
      fetchedAt: result.fetchedAt,
      fromCache: result.fromCache || false,
      prompt: result.prompt,
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Check if web tools are configured
 */
export function isWebConfigured() {
  const apiKey = getBraveApiKey();
  return !!apiKey;
}
