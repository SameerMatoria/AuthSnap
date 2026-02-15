import * as jose from 'jose';
import { SessionError } from '../core/errors.js';

/**
 * Manages JWT-based sessions for AuthSnap.
 * Creates signed JWTs containing the AuthUser payload, sets/reads them from cookies.
 */
export class SessionManager {
  /**
   * @param {import('../core/config.js').SessionConfig} config
   */
  constructor(config) {
    this.config = config;
    this.cookieName = config.cookieName || 'authsnap_session';
    this.maxAge = config.maxAge || 86400;
    this.secure = config.secure ?? true;

    // Encode secret for jose (needs Uint8Array)
    this._secret = new TextEncoder().encode(config.secret);
  }

  /**
   * Create a signed JWT from an AuthUser payload.
   * @param {import('../core/config.js').AuthUser} user
   * @param {Object} [extra] - Additional claims to include in the JWT
   * @param {string[]} [extra.roles] - User roles for RBAC
   * @param {string[]} [extra.permissions] - User permissions for RBAC
   * @returns {Promise<string>} Signed JWT
   */
  async createToken(user, extra = {}) {
    const payload = { user };
    if (extra.roles) payload.roles = extra.roles;
    if (extra.permissions) payload.permissions = extra.permissions;

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.maxAge}s`)
      .setIssuer('authsnap')
      .sign(this._secret);

    return jwt;
  }

  /**
   * Verify and decode a JWT, returning the AuthUser payload.
   * @param {string} token
   * @returns {Promise<import('../core/config.js').AuthUser>}
   */
  async verifyToken(token) {
    try {
      const { payload } = await jose.jwtVerify(token, this._secret, {
        issuer: 'authsnap',
      });
      const user = payload.user;
      if (payload.roles) user.roles = payload.roles;
      if (payload.permissions) user.permissions = payload.permissions;
      return user;
    } catch (err) {
      throw new SessionError(`Invalid or expired session: ${err.message}`);
    }
  }

  /**
   * Build a Set-Cookie header string for the session.
   * @param {string} token - JWT string
   * @returns {string} Set-Cookie header value
   */
  buildCookieHeader(token) {
    const parts = [
      `${this.cookieName}=${token}`,
      `Max-Age=${this.maxAge}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
    ];

    if (this.secure) {
      parts.push('Secure');
    }

    return parts.join('; ');
  }

  /**
   * Extract the session token from a request's cookies.
   * Works with pre-parsed cookies (Express cookie-parser) or raw Cookie header.
   * @param {Object} req - HTTP request object
   * @returns {string | null}
   */
  getTokenFromRequest(req) {
    // If cookies are already parsed (e.g. Express cookie-parser)
    if (req.cookies && req.cookies[this.cookieName]) {
      return req.cookies[this.cookieName];
    }

    // Fallback: parse the raw Cookie header
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;

    const match = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${this.cookieName}=`));

    return match ? match.split('=')[1] : null;
  }

  /**
   * Build a Set-Cookie header that clears the session.
   * @returns {string}
   */
  buildClearCookieHeader() {
    return `${this.cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
  }
}
