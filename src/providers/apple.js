import { BaseProvider } from './base.js';
import { ProviderError } from '../core/errors.js';
import * as jose from 'jose';

const APPLE_ENDPOINTS = {
  authorization: 'https://appleid.apple.com/auth/authorize',
  token: 'https://appleid.apple.com/auth/token',
  userinfo: null, // Apple doesn't have a userinfo endpoint — data comes from the id_token
};

const DEFAULT_SCOPES = ['name', 'email'];

/**
 * Apple OAuth 2.0 + OIDC provider.
 *
 * Apple Sign In is different from other providers:
 * 1. Uses `response_mode=form_post` — callback is a POST, not GET
 * 2. User's name is only sent on FIRST authorization (never again)
 * 3. Profile data comes from the `id_token` (a JWT), not a userinfo API
 * 4. Client secret is a short-lived JWT signed with your private key
 *
 * Required config:
 *   - clientId: Your Services ID (e.g., "com.yourapp.auth")
 *   - clientSecret: Your client secret (or a pre-generated JWT)
 *   - teamId: Your Apple Developer Team ID (optional if using pre-built secret)
 *   - keyId: Your Sign In with Apple private key ID (optional if using pre-built secret)
 *   - privateKey: Your .p8 private key contents (optional if using pre-built secret)
 */
export class AppleProvider extends BaseProvider {
  /** @param {import('../core/config.js').ProviderConfig} config */
  constructor(config) {
    super('apple', config, APPLE_ENDPOINTS, DEFAULT_SCOPES);
  }

  /**
   * Apple requires `response_mode=form_post` and `response_type=code id_token`.
   * @override
   */
  getAuthorizationURL(callbackURL, state) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      response_mode: 'form_post',
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Exchange code for tokens. Apple returns an id_token containing user info.
   * @override
   */
  async exchangeCode(code, callbackURL) {
    const clientSecret = await this._getClientSecret();

    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackURL,
      grant_type: 'authorization_code',
    });

    const response = await fetch(this.endpoints.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
      scope: null,
      idToken: data.id_token, // Apple-specific: JWT containing user claims
    };
  }

  /**
   * Apple doesn't have a userinfo endpoint. Profile data comes from the id_token.
   * The id_token is a JWT issued by Apple containing: sub, email, email_verified.
   *
   * Note: User's name is only available on the FIRST authorization via the
   * `user` POST parameter in the callback — it is NOT in the id_token.
   *
   * @param {string} accessToken
   * @param {Object} [extra] - Extra data (e.g., id_token, user from form POST)
   * @returns {Promise<import('../core/config.js').AuthUser>}
   * @override
   */
  async getProfile(accessToken, extra = {}) {
    const idToken = extra.idToken;

    if (!idToken) {
      throw new ProviderError(
        'Apple requires an id_token for profile data. Pass it via extra.idToken.',
        this.name
      );
    }

    // Decode the id_token (we trust it since it came directly from Apple's token endpoint)
    const claims = jose.decodeJwt(idToken);

    // The `user` object is only sent on the FIRST authorization
    // It comes from the form POST body, not the id_token
    const userData = extra.user || {};

    const name = userData.name
      ? `${userData.name.firstName || ''} ${userData.name.lastName || ''}`.trim()
      : claims.email?.split('@')[0] || 'Apple User';

    return {
      id: claims.sub,
      email: claims.email || '',
      name,
      avatar: null, // Apple never provides an avatar
      provider: 'apple',
      emailVerified: claims.email_verified === 'true' || claims.email_verified === true,
      raw: { ...claims, user: userData },
    };
  }

  /**
   * Generate or return the client secret.
   * If teamId + keyId + privateKey are provided, generates a short-lived JWT.
   * Otherwise, uses the clientSecret directly (pre-generated).
   * @private
   */
  async _getClientSecret() {
    const { teamId, keyId, privateKey } = this.config;

    // If all Apple-specific fields are provided, generate a client_secret JWT
    if (teamId && keyId && privateKey) {
      const key = await jose.importPKCS8(privateKey, 'ES256');

      const secret = await new jose.SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: keyId })
        .setIssuer(teamId)
        .setSubject(this.config.clientId)
        .setAudience('https://appleid.apple.com')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(key);

      return secret;
    }

    // Otherwise use the provided clientSecret directly
    return this.config.clientSecret;
  }
}
