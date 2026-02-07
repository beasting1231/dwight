/**
 * Web search and fetch tools for AI
 *
 * Enables the AI to:
 * - Search the web using Brave Search API
 * - Fetch and extract content from specific URLs
 * - Get up-to-date information beyond training data
 */

import { searchWeb, fetchWebPage, isWebConfigured } from './actions.js';

/**
 * Tool definitions for AI
 */
export const webTools = [
  {
    name: 'web_search',
    description: `Search the web for current information. Use this when you need:
- Up-to-date information (news, events, releases)
- Information beyond your knowledge cutoff
- Multiple sources on a topic
- Documentation or tutorials
- Current prices, stats, or live data

IMPORTANT: After using search results in your response, you MUST include a "Sources:" section at the end with relevant URLs as markdown links.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query. Be specific and include the current year for recent info (e.g., "React 19 features 2026" not just "React features").',
        },
        count: {
          type: 'number',
          description: 'Number of results to return (default: 10, max: 20)',
        },
        allowedDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Only include results from these domains (e.g., ["github.com", "stackoverflow.com"]). Cannot be used with blockedDomains.',
        },
        blockedDomains: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exclude results from these domains (e.g., ["pinterest.com", "quora.com"]). Cannot be used with allowedDomains.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'web_fetch',
    description: `Fetch and extract content from a specific URL. Use this when you:
- Have a specific URL to analyze
- Need full content from a page (not just search snippets)
- Want to summarize or extract info from a known resource

NOTE: This will FAIL for authenticated/private pages (Google Docs, Jira, etc.). Only use for public URLs.`,
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch (must be a valid, public URL)',
        },
        prompt: {
          type: 'string',
          description: 'What information to extract from the page (e.g., "Extract the main article content" or "Find the pricing information")',
        },
      },
      required: ['url'],
    },
  },
];

/**
 * Execute a web tool
 * @param {string} toolName - Tool name
 * @param {Object} params - Tool parameters
 * @returns {Promise<Object>} - Tool result
 */
export async function executeWebTool(toolName, params) {
  // Check if web is configured
  if (!isWebConfigured()) {
    return {
      error: 'Web search is not configured. Ask the user to run the "web" command in the CLI to set up the Brave Search API key.',
    };
  }

  try {
    switch (toolName) {
      case 'web_search':
        // Validate domain filter usage
        if (params.allowedDomains?.length > 0 && params.blockedDomains?.length > 0) {
          return {
            error: 'Cannot use both allowedDomains and blockedDomains. Choose one or the other.',
          };
        }
        return await searchWeb(params);

      case 'web_fetch':
        return await fetchWebPage(params);

      default:
        return { error: `Unknown web tool: ${toolName}` };
    }
  } catch (error) {
    return { error: error.message };
  }
}

// Re-export for convenience
export { isWebConfigured };
export { setupWeb } from './setup.js';
export { clearCache, getCacheStats } from './cache.js';
