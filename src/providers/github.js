import { BaseProvider } from './base.js';

const GITHUB_ENDPOINTS = {
  authorization: 'https://github.com/login/oauth/authorize',
  token: 'https://github.com/login/oauth/access_token',
  userinfo: 'https://api.github.com/user',
};

const DEFAULT_SCOPES = ['read:user', 'user:email'];

/**
 * GitHub OAuth 2.0 provider.
 *
 * Unique data: username, repos, orgs, verified emails.
 * Note: GitHub may not return an email in the profile response if the user
 * has set their email to private. We fetch from /user/emails as a fallback.
 */
export class GitHubProvider extends BaseProvider {
  /** @param {import('../core/config.js').ProviderConfig} config */
  constructor(config) {
    super('github', config, GITHUB_ENDPOINTS, DEFAULT_SCOPES);
  }

  /**
   * GitHub supports `prompt=select_account` to show the account picker.
   * @override
   */
  getAuthorizationURL(callbackURL, state) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      prompt: this.config.prompt || 'select_account',
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Fetch and normalize the GitHub user profile to AuthUser shape.
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   * @override
   */
  async getProfile(accessToken) {
    const raw = await this._apiGet(this.endpoints.userinfo, accessToken);

    let email = raw.email;
    let emailVerified = false;

    // GitHub can return null email if it's set to private — fetch from /user/emails
    if (!email) {
      const emails = await this._apiGet('https://api.github.com/user/emails', accessToken);
      const primary = emails.find((e) => e.primary) || emails[0];
      if (primary) {
        email = primary.email;
        emailVerified = primary.verified ?? false;
      }
    } else {
      emailVerified = true;
    }

    return {
      id: String(raw.id),
      email: email || '',
      name: raw.name || raw.login,
      avatar: raw.avatar_url || null,
      provider: 'github',
      emailVerified,
      raw,
    };
  }
}
