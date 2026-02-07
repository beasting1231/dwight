/**
 * Simple in-memory cache with TTL (15 minutes default)
 */

const cache = new Map();
const DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Get cached value if not expired
 * @param {string} key - Cache key
 * @returns {any|null} - Cached value or null if expired/missing
 */
export function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Set cache value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in ms (default 15 minutes)
 */
export function setCache(key, value, ttl = DEFAULT_TTL) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}

/**
 * Clear expired entries from cache
 */
export function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    }
  }
}

/**
 * Clear all cache entries
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  cleanExpiredCache();
  return {
    entries: cache.size,
    keys: Array.from(cache.keys()),
  };
}
