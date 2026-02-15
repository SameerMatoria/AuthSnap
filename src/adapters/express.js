import { Router } from 'express';
import { handleLogin, handleCallback, handleCallbackError, handleLogout } from '../core/route-handler.js';
import { createRateLimiter } from '../middleware/rate-limit.js';

/**
 * Creates an Express router with all auth routes mounted.
 *
 * Routes generated (per provider):
 *   GET  {basePath}/{provider}          → Redirect to provider's OAuth consent screen
 *   GET  {basePath}/{provider}/callback → Handle OAuth callback, exchange code, create session
 *   GET  {basePath}/logout              → Clear session and redirect
 *
 * @param {import('../core/authsnap.js').AuthSnap} authSnap
 * @returns {import('express').Router}
 */
export function createExpressAdapter(authSnap) {
  const router = Router();
  const { config } = authSnap;
  const basePath = config.basePath;

  // Rate limiter (disabled if config.rateLimit === false)
  const limiter = config.rateLimit !== false
    ? createRateLimiter(config.rateLimit || {})
    : null;

  for (const [providerName, provider] of authSnap.providers) {
    // --- Login route ---
    router.get(`${basePath}/${providerName}`, (req, res) => {
      if (limiter && !limiter.check(getClientIP(req))) {
        return res.status(429).json({ error: 'Too many requests. Try again later.' });
      }

      const callbackURL =
        provider.config.callbackURL ||
        `${getBaseURL(req)}${basePath}/${providerName}/callback`;

      const { redirectURL, state, secure } = handleLogin(authSnap, providerName, callbackURL, req);

      res.cookie('authsnap_state', state, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 600_000,
        secure,
      });

      res.redirect(redirectURL);
    });

    // --- Callback route ---
    router.get(`${basePath}/${providerName}/callback`, async (req, res) => {
      try {
        const { code, state } = req.query;
        const storedState = getCookie(req, 'authsnap_state');

        res.clearCookie('authsnap_state');

        const callbackURL =
          provider.config.callbackURL ||
          `${getBaseURL(req)}${basePath}/${providerName}/callback`;

        const { redirectURL, sessionCookie } = await handleCallback(
          authSnap, providerName, code, state, storedState, callbackURL
        );

        res.setHeader('Set-Cookie', sessionCookie);
        res.redirect(redirectURL);
      } catch (error) {
        const { redirectURL } = handleCallbackError(authSnap, providerName, error);
        res.redirect(redirectURL);
      }
    });
  }

  // --- Logout route ---
  router.get(`${basePath}/logout`, (req, res) => {
    const { clearCookie } = handleLogout(authSnap);
    res.setHeader('Set-Cookie', clearCookie);
    res.redirect('/');
  });

  // --- Error fallback ---
  router.get(`${basePath}/error`, (req, res) => {
    res.status(401).json({ error: 'Authentication failed' });
  });

  return router;
}

/**
 * Detect the base URL from the incoming request.
 * @param {Object} req
 * @returns {string}
 */
function getBaseURL(req) {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}

/**
 * Get client IP from request, respecting X-Forwarded-For.
 * @param {Object} req
 * @returns {string}
 */
function getClientIP(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

/**
 * Parse a specific cookie from the raw Cookie header.
 * @param {Object} req
 * @param {string} name
 * @returns {string | undefined}
 */
function getCookie(req, name) {
  if (req.cookies && req.cookies[name]) {
    return req.cookies[name];
  }
  const header = req.headers?.cookie;
  if (!header) return undefined;
  const match = header
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  return match ? match.split('=')[1] : undefined;
}
