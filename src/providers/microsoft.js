import { BaseProvider } from './base.js';

const MICROSOFT_ENDPOINTS = {
  authorization: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  userinfo: 'https://graph.microsoft.com/v1.0/me',
};

const DEFAULT_SCOPES = ['openid', 'email', 'profile', 'User.Read'];

/**
 * Microsoft OAuth 2.0 provider (Azure AD / Microsoft Entra ID).
 *
 * Supports personal Microsoft accounts, work/school (Azure AD) accounts,
 * and multi-tenant apps via the `common` endpoint.
 *
 * Unique data: Azure AD tenant ID, job title, office location, mail.
 *
 * Config options:
 *   - clientId: Application (client) ID from Azure Portal
 *   - clientSecret: Client secret from Azure Portal
 *   - tenant: Optional. 'common' (default), 'consumers', 'organizations', or a specific tenant ID
 */
export class MicrosoftProvider extends BaseProvider {
  /** @param {import('../core/config.js').ProviderConfig} config */
  constructor(config) {
    const tenant = config.tenant || 'common';

    const endpoints = {
      authorization: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      token: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      userinfo: 'https://graph.microsoft.com/v1.0/me',
    };

    super('microsoft', config, endpoints, DEFAULT_SCOPES);
  }

  /**
   * Microsoft needs `response_mode=query` for code flow.
   * @override
   */
  getAuthorizationURL(callbackURL, state) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      response_mode: 'query',
      prompt: this.config.prompt || 'select_account',
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Fetch and normalize the Microsoft user profile to AuthUser shape.
   * Uses Microsoft Graph API (v1.0/me).
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   * @override
   */
  async getProfile(accessToken) {
    const raw = await this._apiGet(this.endpoints.userinfo, accessToken);

    return {
      id: raw.id,
      email: raw.mail || raw.userPrincipalName || '',
      name: raw.displayName || '',
      avatar: null, // Graph API photo requires a separate call to /me/photo/$value
      provider: 'microsoft',
      emailVerified: true, // Microsoft verifies emails for all account types
      raw,
    };
  }
}
