/**
 * Multi-provider account linking.
 *
 * Links multiple OAuth providers to a single application user.
 * Uses a pluggable store (same pattern as TokenStore) with an
 * in-memory default.
 *
 * @example
 * const linker = new AccountLinker();
 *
 * // In your onSuccess callback:
 * auth.on('success', ({ user }) => {
 *   const existing = linker.findByProvider(user.provider, user.id);
 *   if (existing) {
 *     // User already linked — use existing app userId
 *   } else {
 *     // Link this provider to the app user
 *     linker.link(appUserId, user.provider, user.id);
 *   }
 * });
 */

/**
 * In-memory link store.
 * Forward map: userId → Map<provider, providerId>
 * Reverse index: "provider:providerId" → userId (O(1) lookup)
 */
class InMemoryLinkStore {
  constructor() {
    /** @type {Map<string, Map<string, string>>} userId → { provider → providerId } */
    this._forward = new Map();
    /** @type {Map<string, string>} "provider:providerId" → userId */
    this._reverse = new Map();
  }

  _reverseKey(provider, providerId) {
    return `${provider}:${providerId}`;
  }

  async link(userId, provider, providerId) {
    // Forward map
    if (!this._forward.has(userId)) {
      this._forward.set(userId, new Map());
    }
    this._forward.get(userId).set(provider, providerId);

    // Reverse index
    this._reverse.set(this._reverseKey(provider, providerId), userId);
  }

  async unlink(userId, provider) {
    const links = this._forward.get(userId);
    if (!links) return false;

    const providerId = links.get(provider);
    if (!providerId) return false;

    links.delete(provider);
    this._reverse.delete(this._reverseKey(provider, providerId));

    if (links.size === 0) {
      this._forward.delete(userId);
    }
    return true;
  }

  async getLinkedAccounts(userId) {
    const links = this._forward.get(userId);
    if (!links) return {};
    return Object.fromEntries(links);
  }

  async findByProvider(provider, providerId) {
    return this._reverse.get(this._reverseKey(provider, providerId)) || null;
  }

  async isLinked(userId, provider) {
    const links = this._forward.get(userId);
    return links ? links.has(provider) : false;
  }
}

/**
 * AccountLinker — manages multi-provider account linking.
 */
export class AccountLinker {
  /**
   * @param {Object} [store] - Pluggable store with link/unlink/getLinkedAccounts/findByProvider/isLinked methods
   */
  constructor(store) {
    this.store = store || new InMemoryLinkStore();
  }

  /**
   * Link a provider account to an application user.
   * @param {string} userId - Application user ID
   * @param {string} provider - Provider name (e.g., 'google')
   * @param {string} providerId - Provider's user ID
   */
  async link(userId, provider, providerId) {
    return this.store.link(userId, provider, providerId);
  }

  /**
   * Unlink a provider from an application user.
   * @param {string} userId
   * @param {string} provider
   * @returns {Promise<boolean>} Whether the unlink was successful
   */
  async unlink(userId, provider) {
    return this.store.unlink(userId, provider);
  }

  /**
   * Get all linked providers for a user.
   * @param {string} userId
   * @returns {Promise<Record<string, string>>} { provider: providerId }
   */
  async getLinkedAccounts(userId) {
    return this.store.getLinkedAccounts(userId);
  }

  /**
   * Find the application userId linked to a provider account.
   * @param {string} provider
   * @param {string} providerId
   * @returns {Promise<string | null>}
   */
  async findByProvider(provider, providerId) {
    return this.store.findByProvider(provider, providerId);
  }

  /**
   * Check if a user has a specific provider linked.
   * @param {string} userId
   * @param {string} provider
   * @returns {Promise<boolean>}
   */
  async isLinked(userId, provider) {
    return this.store.isLinked(userId, provider);
  }
}
