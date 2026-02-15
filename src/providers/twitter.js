import { BaseProvider } from './base.js';

const TWITTER_ENDPOINTS = {
  authorization: 'https://twitter.com/i/oauth2/authorize',
  token: 'https://api.twitter.com/2/oauth2/token',
  userinfo: 'https://api.twitter.com/2/users/me',
};

const DEFAULT_SCOPES = ['users.read', 'tweet.read'];

/**
 * Twitter/X OAuth 2.0 provider.
 *
 * Twitter uses OAuth 2.0 with PKCE. For server-side apps with a client_secret,
 * PKCE is optional but the code_challenge is still recommended.
 * Twitter also requires Basic Auth for the token exchange endpoint.
 *
 * Unique data: handle, followers, verified status.
 */
export class TwitterProvider extends BaseProvider {
  /** @param {import('../core/config.js').ProviderConfig} config */
  constructor(config) {
    super('twitter', config, TWITTER_ENDPOINTS, DEFAULT_SCOPES);
  }

  /**
   * Twitter requires `code_challenge` even for confidential clients.
   * We use the "plain" method with the state as the challenge for simplicity
   * since we already have a client_secret for the token exchange.
   * @override
   */
  getAuthorizationURL(callbackURL, state) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      code_challenge: state,
      code_challenge_method: 'plain',
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Twitter requires HTTP Basic Auth (client_id:client_secret) for token exchange
   * instead of sending credentials in the body.
   * @override
   */
  async exchangeCode(code, callbackURL) {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const body = new URLSearchParams({
      code,
      redirect_uri: callbackURL,
      grant_type: 'authorization_code',
      code_verifier: this._lastState || code,
    });

    const response = await fetch(this.endpoints.token, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      const { ProviderError } = await import('../core/errors.js');
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
   * Store the state so we can use it as code_verifier in exchangeCode.
   * Called by the adapter before redirecting.
   * @param {string} callbackURL
   * @param {string} state
   * @returns {string}
   * @override
   */
  getAuthorizationURL(callbackURL, state) {
    // Store state for use as code_verifier in exchangeCode
    this._lastState = state;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      code_challenge: state,
      code_challenge_method: 'plain',
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Fetch and normalize the Twitter user profile to AuthUser shape.
   * Twitter v2 API requires specifying which fields to return.
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   * @override
   */
  async getProfile(accessToken) {
    const url =
      'https://api.twitter.com/2/users/me?user.fields=id,name,username,profile_image_url,verified';

    const raw = await this._apiGet(url, accessToken);
    const user = raw.data;

    return {
      id: user.id,
      email: '', // Twitter v2 doesn't expose email by default
      name: user.name,
      avatar: user.profile_image_url || null,
      provider: 'twitter',
      emailVerified: false,
      raw: user,
    };
  }
}
