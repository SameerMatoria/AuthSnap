import { ConfigError } from './errors.js';

/**
 * @typedef {Object} ProviderConfig
 * @property {string} clientId - OAuth client ID
 * @property {string} clientSecret - OAuth client secret
 * @property {string[]} [scopes] - OAuth scopes to request
 * @property {string} [callbackURL] - Override the default callback URL
 */

/**
 * @typedef {Object} SessionConfig
 * @property {'jwt' | 'cookie'} [strategy='jwt'] - Session strategy
 * @property {string} secret - Secret key for signing sessions
 * @property {number} [maxAge=86400] - Session max age in seconds (default 24h)
 * @property {string} [cookieName='authsnap_session'] - Cookie name for session
 * @property {boolean} [secure=true] - Whether to set secure flag on cookies
 */

/**
 * @typedef {Object} AuthCallbacks
 * @property {(user: AuthUser, tokens: TokenSet, provider: string) => Promise<{redirect?: string}>} [onSuccess]
 * @property {(error: Error, provider: string) => {redirect?: string}} [onError]
 * @property {(provider: string, req: any) => void} [onBeforeAuth]
 * @property {(tokens: TokenSet, provider: string) => void} [onTokenRefresh]
 */

/**
 * @typedef {Object} AuthUser
 * @property {string} id - Provider's user ID
 * @property {string} email - Primary email
 * @property {string} name - Display name
 * @property {string | null} avatar - Profile picture URL
 * @property {string} provider - Provider name ('google', 'github', etc.)
 * @property {boolean} emailVerified - Whether email is verified
 * @property {Record<string, any>} raw - Full provider-specific profile data
 */

/**
 * @typedef {Object} TokenSet
 * @property {string} accessToken - OAuth access token
 * @property {string} [refreshToken] - OAuth refresh token
 * @property {number} [expiresAt] - Token expiry timestamp (ms)
 * @property {string} [tokenType] - Token type (e.g. 'Bearer')
 * @property {string} [scope] - Granted scopes
 */

/**
 * @typedef {Object} RateLimitConfig
 * @property {number} [windowMs=60000] - Time window in milliseconds
 * @property {number} [max=10] - Max requests per window per IP
 */

/**
 * @typedef {Object} AuthSnapConfig
 * @property {Record<string, ProviderConfig>} providers - Provider configurations
 * @property {SessionConfig} [session] - Session configuration
 * @property {AuthCallbacks} [callbacks] - Lifecycle callbacks
 * @property {string} [basePath='/auth'] - Base path for auth routes
 * @property {string} [baseURL] - Base URL for callbacks (auto-detected if not set)
 * @property {import('../session/token-store.js').TokenStore} [tokenStore] - Custom token store instance
 * @property {RateLimitConfig | false} [rateLimit] - Rate limiting config (false to disable)
 * @property {string[]} [allowedRedirects] - Allowed redirect URLs/origins after auth (prevents open redirects)
 */

/** Default session settings */
const SESSION_DEFAULTS = {
  strategy: 'jwt',
  maxAge: 86400,
  cookieName: 'authsnap_session',
  secure: true,
};

/**
 * Validates and normalizes AuthSnap configuration.
 * @param {AuthSnapConfig} config
 * @returns {AuthSnapConfig} Normalized config
 */
export function validateConfig(config) {
  if (!config) {
    throw new ConfigError('AuthSnap configuration is required');
  }

  if (!config.providers || Object.keys(config.providers).length === 0) {
    throw new ConfigError('At least one provider must be configured');
  }

  for (const [name, provider] of Object.entries(config.providers)) {
    if (!provider.clientId) {
      throw new ConfigError(`Provider "${name}" is missing clientId`);
    }
    if (!provider.clientSecret) {
      throw new ConfigError(`Provider "${name}" is missing clientSecret`);
    }
  }

  const session = { ...SESSION_DEFAULTS, ...config.session };

  if (!session.secret) {
    throw new ConfigError(
      'Session secret is required. Set session.secret or SESSION_SECRET env var.'
    );
  }

  return {
    ...config,
    basePath: config.basePath || '/auth',
    session,
    callbacks: config.callbacks || {},
  };
}
