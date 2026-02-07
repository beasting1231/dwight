/**
 * Google Calendar OAuth2 token management
 * Handles authorization URL generation, token exchange, and refresh
 */

import { loadConfig, saveConfig } from '../../config.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'http://localhost:8085/oauth/callback';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Generate the OAuth2 authorization URL
 * @param {string} clientId - Google OAuth client ID
 * @returns {string} - Authorization URL to open in browser
 */
export function getAuthorizationUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${GOOGLE_AUTH_URL}?${params}`;
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from user
 * @param {string} clientId - Google OAuth client ID
 * @param {string} clientSecret - Google OAuth client secret
 * @returns {Promise<Object>} - Token response with access_token, refresh_token, expiry_date
 */
export async function exchangeCodeForTokens(code, clientId, clientSecret) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.error || 'Failed to exchange code for tokens');
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry_date: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Refresh the access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @param {string} clientId - Google OAuth client ID
 * @param {string} clientSecret - Google OAuth client secret
 * @returns {Promise<Object>} - New token response
 */
export async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || error.error || 'Failed to refresh token');
  }

  const data = await response.json();

  return {
    access_token: data.access_token,
    refresh_token: refreshToken, // Refresh token stays the same
    expiry_date: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Check if token is expired or about to expire (5 min buffer)
 * @param {number} expiryDate - Token expiry timestamp
 * @returns {boolean} - True if token needs refresh
 */
export function isTokenExpired(expiryDate) {
  const BUFFER_MS = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= expiryDate - BUFFER_MS;
}

/**
 * Get valid access token, refreshing if needed
 * @returns {Promise<string>} - Valid access token
 */
export async function getValidAccessToken() {
  const config = loadConfig();
  const calendarConfig = config?.calendar;

  if (!calendarConfig?.enabled) {
    throw new Error('Calendar is not configured. Run "calendar" command to set it up.');
  }

  if (!calendarConfig.tokens?.access_token) {
    throw new Error('Calendar tokens not found. Run "calendar" command to re-authenticate.');
  }

  const { tokens, clientId, clientSecret } = calendarConfig;

  // Check if token needs refresh
  if (isTokenExpired(tokens.expiry_date)) {
    if (!tokens.refresh_token) {
      throw new Error('Refresh token not found. Run "calendar" command to re-authenticate.');
    }

    // Refresh the token
    const newTokens = await refreshAccessToken(
      tokens.refresh_token,
      clientId,
      clientSecret
    );

    // Save new tokens
    config.calendar.tokens = newTokens;
    saveConfig(config);

    return newTokens.access_token;
  }

  return tokens.access_token;
}

/**
 * Save calendar tokens to config
 * @param {Object} tokens - Token object
 * @param {string} clientId - Client ID
 * @param {string} clientSecret - Client secret
 */
export function saveCalendarTokens(tokens, clientId, clientSecret) {
  const config = loadConfig() || {};
  config.calendar = {
    enabled: true,
    clientId,
    clientSecret,
    tokens,
  };
  saveConfig(config);
}

/**
 * Check if calendar is configured
 * @returns {boolean}
 */
export function isCalendarConfigured() {
  const config = loadConfig();
  return !!(
    config?.calendar?.enabled &&
    config?.calendar?.clientId &&
    config?.calendar?.clientSecret &&
    config?.calendar?.tokens?.access_token
  );
}
