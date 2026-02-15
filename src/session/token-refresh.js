import { TokenStore } from './token-store.js';
import { ProviderError } from '../core/errors.js';

/**
 * Handles automatic token refresh for OAuth providers.
 *
 * When an access token expires, this module uses the stored refresh token
 * to get a new access token from the provider, updates the TokenStore,
 * and fires the onTokenRefresh callback.
 *
 * @example
 * const refresher = new TokenRefresher(authSnap);
 * const tokens = await refresher.getValidTokens('google', '123');
 * // Returns current tokens if valid, or refreshes and returns new ones
 */
export class TokenRefresher {
  /**
   * @param {import('../core/authsnap.js').AuthSnap} authSnap
   */
  constructor(authSnap) {
    this.authSnap = authSnap;
  }

  /**
   * Get valid tokens for a user. If the access token is expired and a refresh
   * token exists, automatically refreshes and returns new tokens.
   *
   * @param {string} providerName - Provider name (e.g., 'google')
   * @param {string} userId - User's provider ID
   * @returns {Promise<import('../core/config.js').TokenSet | null>} Valid tokens, or null if unavailable
   */
  async getValidTokens(providerName, userId) {
    const { tokenStore } = this.authSnap;
    const key = TokenStore.key(providerName, userId);

    const tokens = await tokenStore.get(key);
    if (!tokens) return null;

    // If not expired, return as-is
    const expired = await tokenStore.isExpired(key);
    if (!expired) return tokens;

    // If expired but no refresh token, we can't refresh
    if (!tokens.refreshToken) return null;

    // Attempt refresh
    return this._refresh(providerName, userId, tokens);
  }

  /**
   * Force a token refresh, even if the current token hasn't expired.
   *
   * @param {string} providerName
   * @param {string} userId
   * @returns {Promise<import('../core/config.js').TokenSet | null>}
   */
  async forceRefresh(providerName, userId) {
    const { tokenStore } = this.authSnap;
    const key = TokenStore.key(providerName, userId);

    const tokens = await tokenStore.get(key);
    if (!tokens || !tokens.refreshToken) return null;

    return this._refresh(providerName, userId, tokens);
  }

  /**
   * Perform the actual token refresh.
   * @private
   */
  async _refresh(providerName, userId, currentTokens) {
    const { config, tokenStore } = this.authSnap;
    const provider = this.authSnap.getProvider(providerName);
    const key = TokenStore.key(providerName, userId);

    try {
      const newTokens = await this._exchangeRefreshToken(provider, currentTokens.refreshToken);

      // Keep the refresh token if the provider didn't issue a new one
      if (!newTokens.refreshToken && currentTokens.refreshToken) {
        newTokens.refreshToken = currentTokens.refreshToken;
      }

      // Update the store
      await tokenStore.set(key, newTokens);

      // Fire the onTokenRefresh callback
      if (config.callbacks.onTokenRefresh) {
        config.callbacks.onTokenRefresh(newTokens, providerName);
      }

      this.authSnap.emit('token:refresh', { tokens: newTokens, provider: providerName });

      return newTokens;
    } catch (error) {
      // If refresh fails, remove the invalid tokens
      await tokenStore.delete(key);
      return null;
    }
  }

  /**
   * Exchange a refresh token for a new access token.
   * @private
   * @param {import('../providers/base.js').BaseProvider} provider
   * @param {string} refreshToken
   * @returns {Promise<import('../core/config.js').TokenSet>}
   */
  async _exchangeRefreshToken(provider, refreshToken) {
    const body = new URLSearchParams({
      client_id: provider.config.clientId,
      client_secret: provider.config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch(provider.endpoints.token, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(
        `Token refresh failed (${response.status}): ${text}`,
        provider.name
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope || null,
    };
  }
}
