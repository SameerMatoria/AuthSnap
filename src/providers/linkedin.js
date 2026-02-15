import { BaseProvider } from './base.js';

const LINKEDIN_ENDPOINTS = {
  authorization: 'https://www.linkedin.com/oauth/v2/authorization',
  token: 'https://www.linkedin.com/oauth/v2/accessToken',
  userinfo: 'https://api.linkedin.com/v2/userinfo',
};

const DEFAULT_SCOPES = ['openid', 'profile', 'email'];

/**
 * LinkedIn OAuth 2.0 provider (OpenID Connect).
 *
 * @example
 * providers: {
 *   linkedin: { clientId: 'xxx', clientSecret: 'xxx' }
 * }
 */
export class LinkedInProvider extends BaseProvider {
  constructor(config) {
    super('linkedin', config, LINKEDIN_ENDPOINTS, DEFAULT_SCOPES);
  }

  /**
   * Fetch and normalize the LinkedIn user profile.
   * LinkedIn's OIDC userinfo endpoint returns sub, name, email, picture, email_verified.
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   */
  async getProfile(accessToken) {
    const raw = await this._apiGet(this.endpoints.userinfo, accessToken);

    return {
      id: raw.sub,
      email: raw.email || '',
      name: raw.name || '',
      avatar: raw.picture || null,
      provider: 'linkedin',
      emailVerified: raw.email_verified ?? false,
      raw,
    };
  }
}
