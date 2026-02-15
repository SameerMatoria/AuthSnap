/**
 * In-memory token store for OAuth access/refresh tokens.
 *
 * Stores tokens keyed by `{provider}:{userId}` so you can later
 * retrieve a user's access token to call provider APIs on their behalf.
 *
 * For production, replace with a database-backed store by implementing
 * the same interface (get, set, delete, has).
 *
 * @example
 * const store = new TokenStore();
 * await store.set('google:123', tokens);
 * const tokens = await store.get('google:123');
 */
export class TokenStore {
  constructor() {
    /** @type {Map<string, import('../core/config.js').TokenSet>} */
    this._store = new Map();
  }

  /**
   * Build a storage key from provider name and user ID.
   * @param {string} provider
   * @param {string} userId
   * @returns {string}
   */
  static key(provider, userId) {
    return `${provider}:${userId}`;
  }

  /**
   * Store tokens for a user.
   * @param {string} key - Storage key (use TokenStore.key())
   * @param {import('../core/config.js').TokenSet} tokens
   */
  async set(key, tokens) {
    this._store.set(key, { ...tokens, storedAt: Date.now() });
  }

  /**
   * Retrieve tokens for a user.
   * @param {string} key
   * @returns {Promise<import('../core/config.js').TokenSet | null>}
   */
  async get(key) {
    return this._store.get(key) || null;
  }

  /**
   * Check if tokens exist for a user.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    return this._store.has(key);
  }

  /**
   * Delete tokens for a user.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async delete(key) {
    return this._store.delete(key);
  }

  /**
   * Check if a stored token set has expired.
   * @param {string} key
   * @returns {Promise<boolean>} true if expired or not found
   */
  async isExpired(key) {
    const tokens = await this.get(key);
    if (!tokens) return true;
    if (!tokens.expiresAt) return false; // No expiry info — assume valid
    return Date.now() > tokens.expiresAt;
  }

  /**
   * Get the number of stored token sets.
   * @returns {number}
   */
  get size() {
    return this._store.size;
  }

  /**
   * Clear all stored tokens.
   */
  async clear() {
    this._store.clear();
  }
}
