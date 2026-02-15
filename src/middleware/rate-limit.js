/**
 * In-memory sliding window rate limiter for auth routes.
 * No external dependencies — uses a simple Map with automatic cleanup.
 *
 * @example
 * const limiter = createRateLimiter({ windowMs: 60000, max: 10 });
 * // In route handler:
 * if (!limiter.check(ip)) {
 *   return res.status(429).json({ error: 'Too many requests' });
 * }
 */

/** @typedef {{ timestamps: number[] }} RateLimitEntry */

/**
 * Creates a rate limiter instance.
 * @param {Object} [options]
 * @param {number} [options.windowMs=60000] - Time window in milliseconds
 * @param {number} [options.max=10] - Max requests per window per key (usually IP)
 * @returns {{ check: (key: string) => boolean, reset: (key: string) => void, clear: () => void }}
 */
export function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60_000;
  const max = options.max || 10;

  /** @type {Map<string, number[]>} */
  const store = new Map();

  // Periodically clean up expired entries (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of store) {
      const valid = timestamps.filter(t => now - t < windowMs);
      if (valid.length === 0) {
        store.delete(key);
      } else {
        store.set(key, valid);
      }
    }
  }, 5 * 60_000);

  // Don't prevent process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return {
    /**
     * Check if a request is allowed. Returns true if allowed, false if rate limited.
     * @param {string} key - Rate limit key (usually client IP)
     * @returns {boolean}
     */
    check(key) {
      const now = Date.now();
      const timestamps = store.get(key) || [];

      // Remove timestamps outside the window
      const valid = timestamps.filter(t => now - t < windowMs);

      if (valid.length >= max) {
        store.set(key, valid);
        return false; // Rate limited
      }

      valid.push(now);
      store.set(key, valid);
      return true; // Allowed
    },

    /**
     * Reset rate limit for a specific key.
     * @param {string} key
     */
    reset(key) {
      store.delete(key);
    },

    /**
     * Clear all rate limit data.
     */
    clear() {
      store.clear();
    },
  };
}
