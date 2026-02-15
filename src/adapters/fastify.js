import { handleLogin, handleCallback, handleCallbackError, handleLogout } from '../core/route-handler.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

/**
 * Creates a Fastify plugin that registers all auth routes.
 *
 * @example
 * fastify.register(auth.fastify());
 *
 * @param {import('../core/authsnap.js').AuthSnap} authSnap
 * @returns {Function} Fastify plugin function
 */
export function createFastifyAdapter(authSnap) {
  const { config } = authSnap;
  const basePath = config.basePath;

  /**
   * Fastify plugin — registers routes when called by fastify.register().
   * @param {import('fastify').FastifyInstance} fastify
   * @param {Object} _opts
   * @param {Function} done
   */
  // Rate limiter (disabled if config.rateLimit === false)
  const limiter = config.rateLimit !== false
    ? createRateLimiter(config.rateLimit || {})
    : null;

  async function plugin(fastify, _opts) {
    // Register @fastify/cookie if not already registered (needed for state cookies)
    // Users should install @fastify/cookie themselves; we parse manually as fallback.

    for (const [providerName, provider] of authSnap.providers) {
      // --- Login route ---
      fastify.get(`${basePath}/${providerName}`, (request, reply) => {
        if (limiter && !limiter.check(getClientIP(request))) {
          return reply.code(429).send({ error: 'Too many requests. Try again later.' });
        }

        const callbackURL =
          provider.config.callbackURL ||
          `${getBaseURL(request)}${basePath}/${providerName}/callback`;

        const { redirectURL, state, secure } = handleLogin(authSnap, providerName, callbackURL, request);

        // Set state cookie
        reply.setCookie('authsnap_state', state, {
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 600,
          secure,
          path: '/',
        });

        reply.redirect(redirectURL);
      });

      // --- Callback route ---
      fastify.get(`${basePath}/${providerName}/callback`, async (request, reply) => {
        try {
          const { code, state } = request.query;
          const storedState = getCookie(request, 'authsnap_state');

          // Clear state cookie
          reply.clearCookie('authsnap_state', { path: '/' });

          const callbackURL =
            provider.config.callbackURL ||
            `${getBaseURL(request)}${basePath}/${providerName}/callback`;

          const { redirectURL, sessionCookie } = await handleCallback(
            authSnap, providerName, code, state, storedState, callbackURL
          );

          reply.header('Set-Cookie', sessionCookie);
          reply.redirect(redirectURL);
        } catch (error) {
          const { redirectURL } = handleCallbackError(authSnap, providerName, error);
          reply.redirect(redirectURL);
        }
      });
    }

    // --- Logout route ---
    fastify.get(`${basePath}/logout`, (request, reply) => {
      const { clearCookie } = handleLogout(authSnap);
      reply.header('Set-Cookie', clearCookie);
      reply.redirect('/');
    });

    // --- Error fallback ---
    fastify.get(`${basePath}/error`, (request, reply) => {
      reply.code(401).send({ error: 'Authentication failed' });
    });
  }

  // Mark as a Fastify plugin (avoids encapsulation issues)
  plugin[Symbol.for('skip-override')] = true;

  return plugin;
}

/**
 * Detect base URL from Fastify request.
 * @param {Object} request
 * @returns {string}
 */
function getBaseURL(request) {
  const protocol = request.protocol || 'http';
  const host = request.hostname || 'localhost:3000';
  const port = request.port ? `:${request.port}` : '';
  return `${protocol}://${host}${port}`;
}

/**
 * Get client IP from Fastify request.
 * @param {Object} request
 * @returns {string}
 */
function getClientIP(request) {
  return request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.socket?.remoteAddress || 'unknown';
}

/**
 * Parse a cookie from Fastify request.
 * Works with @fastify/cookie (request.cookies) or raw header.
 * @param {Object} request
 * @param {string} name
 * @returns {string | undefined}
 */
function getCookie(request, name) {
  // @fastify/cookie populates request.cookies
  if (request.cookies && request.cookies[name]) {
    return request.cookies[name];
  }
  const header = request.headers?.cookie;
  if (!header) return undefined;
  const match = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.split('=')[1] : undefined;
}
