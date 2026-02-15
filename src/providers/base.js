import { ProviderError } from '../core/errors.js';

/**
 * Base class for all OAuth providers.
 * Each provider must implement: getAuthorizationURL, exchangeCode, getProfile.
 */
export class BaseProvider {
  /**
   * @param {string} name - Provider identifier (e.g. 'google', 'github')
   * @param {import('../core/config.js').ProviderConfig} config
   * @param {Object} endpoints
   * @param {string} endpoints.authorization - Authorization URL
   * @param {string} endpoints.token - Token exchange URL
   * @param {string} endpoints.userinfo - User profile URL
   * @param {string[]} [defaultScopes=[]] - Default scopes if none specified
   */
  constructor(name, config, endpoints, defaultScopes = []) {
    this.name = name;
    this.config = config;
    this.endpoints = endpoints;
    this.scopes = config.scopes || defaultScopes;
  }

  /**
   * Build the authorization URL that the user's browser will be redirected to.
   * @param {string} callbackURL - Full callback URL
   * @param {string} state - CSRF state token
   * @returns {string} Authorization URL
   */
  getAuthorizationURL(callbackURL, state) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for tokens.
   * @param {string} code - Authorization code from callback
   * @param {string} callbackURL - The redirect_uri used during authorization
   * @returns {Promise<import('../core/config.js').TokenSet>}
   */
  async exchangeCode(code, callbackURL) {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: callbackURL,
      grant_type: 'authorization_code',
    });

    const response = await fetch(this.endpoints.token, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(
        `Token exchange failed (${response.status}): ${text}`,
        this.name
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

  /**
   * Fetch the user's profile from the provider.
   * Subclasses must implement this to map provider data to AuthUser shape.
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   * @abstract
   */
  async getProfile(accessToken) {
    throw new ProviderError('getProfile() must be implemented by subclass', this.name);
  }

  /**
   * Helper: perform a GET request to the provider's API.
   * @param {string} url
   * @param {string} accessToken
   * @returns {Promise<any>}
   * @protected
   */
  async _apiGet(url, accessToken) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ProviderError(
        `API request failed (${response.status}): ${text}`,
        this.name
      );
    }

    return response.json();
  }
}
