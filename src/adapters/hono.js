import { handleLogin, handleCallback, handleCallbackError, handleLogout } from '../core/route-handler.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

/**
 * Creates a Hono middleware app that registers all auth routes.
 *
 * @example
 * import { Hono } from 'hono';
 * const app = new Hono();
 * app.route('', auth.hono());
 *
 * @param {import('../core/authsnap.js').AuthSnap} authSnap
 * @returns {Function} Async function that takes a Hono app to mount routes on
 */
export function createHonoAdapter(authSnap) {
  const { config } = authSnap;
  const basePath = config.basePath;

  /**
   * Returns a route-registration function. The caller must provide
   * the Hono module so we don't force it as a dependency.
   *
   * Usage:
   *   import { Hono } from 'hono';
   *   const routes = auth.hono();
   *   app.route('', routes(Hono));
   *
   * Or simpler — pass the Hono constructor:
   *   app.route('', auth.hono(Hono));
   */

  /**
   * Register all auth routes on a fresh Hono sub-app.
   * @param {Function} Hono - The Hono constructor
   * @returns {Object} A Hono app with auth routes
   */
  // Rate limiter (disabled if config.rateLimit === false)
  const limiter = config.rateLimit !== false
    ? createRateLimiter(config.rateLimit || {})
    : null;

  return function mountRoutes(Hono) {
    const authApp = new Hono();

    for (const [providerName, provider] of authSnap.providers) {
      // --- Login route ---
      authApp.get(`${basePath}/${providerName}`, (c) => {
        if (limiter && !limiter.check(getClientIP(c))) {
          return c.json({ error: 'Too many requests. Try again later.' }, 429);
        }

        const callbackURL =
          provider.config.callbackURL ||
          `${getBaseURL(c)}${basePath}/${providerName}/callback`;

        const { redirectURL, state, secure } = handleLogin(authSnap, providerName, callbackURL, c.req);

        // Set state cookie via Set-Cookie header
        const stateCookie = buildCookie('authsnap_state', state, {
          httpOnly: true,
          sameSite: 'Lax',
          maxAge: 600,
          secure,
          path: '/',
        });

        return c.redirect(redirectURL, 302, {
          headers: { 'Set-Cookie': stateCookie },
        });
      });

      // --- Callback route ---
      authApp.get(`${basePath}/${providerName}/callback`, async (c) => {
        try {
          const code = c.req.query('code');
          const state = c.req.query('state');
          const storedState = getCookie(c, 'authsnap_state');

          const callbackURL =
            provider.config.callbackURL ||
            `${getBaseURL(c)}${basePath}/${providerName}/callback`;

          const { redirectURL, sessionCookie } = await handleCallback(
            authSnap, providerName, code, state, storedState, callbackURL
          );

          // Clear state cookie + set session cookie
          const clearState = buildCookie('authsnap_state', '', { maxAge: 0, path: '/' });

          return new Response(null, {
            status: 302,
            headers: [
              ['Location', redirectURL],
              ['Set-Cookie', clearState],
              ['Set-Cookie', sessionCookie],
            ],
          });
        } catch (error) {
          const { redirectURL } = handleCallbackError(authSnap, providerName, error);
          return c.redirect(redirectURL, 302);
        }
      });
    }

    // --- Logout route ---
    authApp.get(`${basePath}/logout`, (c) => {
      const { clearCookie } = handleLogout(authSnap);
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/',
          'Set-Cookie': clearCookie,
        },
      });
    });

    // --- Error fallback ---
    authApp.get(`${basePath}/error`, (c) => {
      return c.json({ error: 'Authentication failed' }, 401);
    });

    return authApp;
  };
}

/**
 * Detect base URL from Hono context.
 * @param {Object} c - Hono context
 * @returns {string}
 */
function getBaseURL(c) {
  const url = new URL(c.req.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Get client IP from Hono context.
 * @param {Object} c - Hono context
 * @returns {string}
 */
function getClientIP(c) {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.env?.remoteAddr || 'unknown';
}

/**
 * Parse a cookie from Hono context.
 * @param {Object} c - Hono context
 * @param {string} name
 * @returns {string | undefined}
 */
function getCookie(c, name) {
  const header = c.req.header('cookie');
  if (!header) return undefined;
  const match = header
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));
  return match ? match.split('=')[1] : undefined;
}

/**
 * Build a Set-Cookie header string.
 * @param {string} name
 * @param {string} value
 * @param {Object} opts
 * @returns {string}
 */
function buildCookie(name, value, opts = {}) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}
