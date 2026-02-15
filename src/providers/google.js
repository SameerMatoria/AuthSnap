import { BaseProvider } from './base.js';

const GOOGLE_ENDPOINTS = {
  authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
};

const DEFAULT_SCOPES = ['openid', 'email', 'profile'];

/**
 * Google OAuth 2.0 provider.
 *
 * Unique data: email verified status, locale, HD domain (Google Workspace).
 */
export class GoogleProvider extends BaseProvider {
  /** @param {import('../core/config.js').ProviderConfig} config */
  constructor(config) {
    super('google', config, GOOGLE_ENDPOINTS, DEFAULT_SCOPES);
  }

  /**
   * Google needs `access_type=offline` to issue a refresh token.
   * Uses `prompt=select_account consent` to show the account picker AND consent screen.
   * @override
   */
  getAuthorizationURL(callbackURL, state) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: this.config.prompt || 'select_account consent',
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Fetch and normalize the Google user profile to AuthUser shape.
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   * @override
   */
  async getProfile(accessToken) {
    const raw = await this._apiGet(this.endpoints.userinfo, accessToken);

    return {
      id: raw.id,
      email: raw.email,
      name: raw.name,
      avatar: raw.picture || null,
      provider: 'google',
      emailVerified: raw.verified_email ?? false,
      raw,
    };
  }
}
