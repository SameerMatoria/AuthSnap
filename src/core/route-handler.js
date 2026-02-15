import { randomBytes } from 'node:crypto';

/**
 * Framework-agnostic OAuth route handler logic.
 *
 * This module contains the pure business logic for login, callback,
 * and logout routes. Framework adapters (Express, Fastify, Hono) call
 * these functions and translate the results to framework-specific responses.
 *
 * This avoids duplicating the OAuth flow across every adapter.
 */

/**
 * @typedef {Object} LoginResult
 * @property {string} redirectURL - URL to redirect the user to
 * @property {string} state - Generated CSRF state token
 * @property {boolean} secure - Whether cookies should be Secure
 */

/**
 * Handle the login route — generate state and build the authorization URL.
 * @param {import('./authsnap.js').AuthSnap} authSnap
 * @param {string} providerName
 * @param {string} callbackURL
 * @param {Object} [req] - Framework request object (passed to onBeforeAuth)
 * @returns {LoginResult}
 */
export function handleLogin(authSnap, providerName, callbackURL, req) {
  const { config } = authSnap;
  const provider = authSnap.getProvider(providerName);

  const state = randomBytes(32).toString('hex');

  if (config.callbacks.onBeforeAuth) {
    config.callbacks.onBeforeAuth(providerName, req);
  }

  authSnap.emit('login', { provider: providerName, req });

  const redirectURL = provider.getAuthorizationURL(callbackURL, state);

  return { redirectURL, state, secure: config.session.secure };
}

/**
 * @typedef {Object} CallbackResult
 * @property {string} redirectURL - Where to redirect the user
 * @property {string} sessionCookie - Set-Cookie header value for the session
 */

/**
 * Handle the OAuth callback — validate state, exchange code, create session.
 * @param {import('./authsnap.js').AuthSnap} authSnap
 * @param {string} providerName
 * @param {string} code - Authorization code
 * @param {string} state - State from query string
 * @param {string} storedState - State from cookie
 * @param {string} callbackURL - The callback URL used during authorization
 * @returns {Promise<CallbackResult>}
 */
export async function handleCallback(authSnap, providerName, code, state, storedState, callbackURL) {
  const { config, sessionManager } = authSnap;
  const provider = authSnap.getProvider(providerName);

  // Validate CSRF state
  if (!state || state !== storedState) {
    throw new Error('Invalid state parameter — possible CSRF attack');
  }

  if (!code) {
    throw new Error('No authorization code received from provider');
  }

  // Exchange code for tokens
  const tokens = await provider.exchangeCode(code, callbackURL);

  // Fetch user profile
  const user = await provider.getProfile(tokens.accessToken);

  // Store tokens if tokenStore is configured
  if (authSnap.tokenStore) {
    const { TokenStore } = await import('../session/token-store.js');
    const key = TokenStore.key(providerName, user.id);
    await authSnap.tokenStore.set(key, tokens);
  }

  // Fire onSuccess callback
  let result = {};
  if (config.callbacks.onSuccess) {
    result = (await config.callbacks.onSuccess(user, tokens, providerName)) || {};
  }

  authSnap.emit('success', { user, tokens, provider: providerName });

  // Validate redirect URL to prevent open redirects
  const redirect = result.redirect || '/';
  const safeRedirect = validateRedirect(redirect, config.allowedRedirects);

  // Create session JWT (include roles/permissions from onSuccess if provided)
  const extra = {};
  if (result.roles) extra.roles = result.roles;
  if (result.permissions) extra.permissions = result.permissions;
  const jwt = await sessionManager.createToken(user, extra);
  const sessionCookie = sessionManager.buildCookieHeader(jwt);

  return {
    redirectURL: safeRedirect,
    sessionCookie,
  };
}

/**
 * Handle callback errors — fire onError hook and determine redirect.
 * @param {import('./authsnap.js').AuthSnap} authSnap
 * @param {string} providerName
 * @param {Error} error
 * @returns {{ redirectURL: string }}
 */
export function handleCallbackError(authSnap, providerName, error) {
  const { config } = authSnap;
  let result = {};

  if (config.callbacks.onError) {
    result = config.callbacks.onError(error, providerName) || {};
  }

  authSnap.emit('error', { error, provider: providerName });

  const redirect = result.redirect || `${config.basePath}/error`;
  return {
    redirectURL: validateRedirect(redirect, config.allowedRedirects),
  };
}

/**
 * Handle logout — return the cookie-clearing header.
 * @param {import('./authsnap.js').AuthSnap} authSnap
 * @returns {{ clearCookie: string }}
 */
export function handleLogout(authSnap) {
  authSnap.emit('logout', {});

  return {
    clearCookie: authSnap.sessionManager.buildClearCookieHeader(),
  };
}

/**
 * Validate a redirect URL to prevent open redirect attacks.
 * - Relative paths (starting with /) are always allowed
 * - Absolute URLs are only allowed if their origin is in the allowedRedirects list
 * - Falls back to '/' if the redirect is not safe
 *
 * @param {string} redirect - The redirect URL to validate
 * @param {string[]} [allowedRedirects] - List of allowed origins/URLs
 * @returns {string} A safe redirect URL
 */
function validateRedirect(redirect, allowedRedirects) {
  // Relative paths are always safe
  if (redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }

  // If no allowlist is configured, only allow relative paths
  if (!allowedRedirects || allowedRedirects.length === 0) {
    // Block absolute URLs when no allowlist is set — fall back to /
    if (redirect.startsWith('http://') || redirect.startsWith('https://') || redirect.startsWith('//')) {
      return '/';
    }
    return redirect;
  }

  // Check against the allowlist
  try {
    const url = new URL(redirect);
    const origin = url.origin;

    for (const allowed of allowedRedirects) {
      // Exact URL match
      if (redirect === allowed) return redirect;
      // Origin match (e.g., 'https://myapp.com' matches 'https://myapp.com/dashboard')
      if (origin === allowed) return redirect;
    }
  } catch {
    // Not a valid URL — treat as relative
    return redirect;
  }

  // Not in allowlist — block it
  return '/';
}
