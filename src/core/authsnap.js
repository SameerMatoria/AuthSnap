import { EventEmitter } from 'node:events';
import { validateConfig } from './config.js';
import { ConfigError } from './errors.js';
import { GoogleProvider } from '../providers/google.js';
import { GitHubProvider } from '../providers/github.js';
import { DiscordProvider } from '../providers/discord.js';
import { TwitterProvider } from '../providers/twitter.js';
import { AppleProvider } from '../providers/apple.js';
import { MicrosoftProvider } from '../providers/microsoft.js';
import { LinkedInProvider } from '../providers/linkedin.js';
import { SpotifyProvider } from '../providers/spotify.js';
import { SessionManager } from '../session/session-manager.js';
import { TokenStore } from '../session/token-store.js';
import { TokenRefresher } from '../session/token-refresh.js';
import { createExpressAdapter } from '../adapters/express.js';
import { createFastifyAdapter } from '../adapters/fastify.js';
import { createHonoAdapter } from '../adapters/hono.js';
import { createProtectMiddleware } from '../middleware/protect.js';

/** Built-in provider constructors keyed by name */
const BUILT_IN_PROVIDERS = {
  google: GoogleProvider,
  github: GitHubProvider,
  discord: DiscordProvider,
  twitter: TwitterProvider,
  apple: AppleProvider,
  microsoft: MicrosoftProvider,
  linkedin: LinkedInProvider,
  spotify: SpotifyProvider,
};

/**
 * AuthSnap — zero-boilerplate OAuth for any Node.js framework.
 *
 * @example
 * const auth = new AuthSnap({
 *   providers: {
 *     google: { clientId: '...', clientSecret: '...' },
 *     github: { clientId: '...', clientSecret: '...' },
 *     discord: { clientId: '...', clientSecret: '...', scopes: ['identify', 'email', 'guilds'] },
 *   },
 *   session: { strategy: 'jwt', secret: process.env.SESSION_SECRET },
 * });
 *
 * // Express
 * app.use(auth.express());
 *
 * // Fastify
 * fastify.register(auth.fastify());
 *
 * // Hono
 * app.route('', auth.hono()(Hono));
 */
export class AuthSnap {
  /**
   * @param {import('./config.js').AuthSnapConfig} config
   */
  constructor(config) {
    this.config = validateConfig(config);

    /** @type {Map<string, import('../providers/base.js').BaseProvider>} */
    this.providers = new Map();

    /** @type {SessionManager} */
    this.sessionManager = new SessionManager(this.config.session);

    /** @type {TokenStore} */
    this.tokenStore = config.tokenStore || new TokenStore();

    /** @type {TokenRefresher} */
    this.tokenRefresher = new TokenRefresher(this);

    /** @type {EventEmitter} */
    this._emitter = new EventEmitter();

    this._registerProviders();
  }

  /**
   * Instantiate and register each configured provider.
   * Supports built-in providers by name and custom providers via `provider` key.
   *
   * @example
   * // Custom provider
   * providers: {
   *   linkedin: {
   *     provider: LinkedInProvider,  // class extending BaseProvider
   *     clientId: '...',
   *     clientSecret: '...',
   *   }
   * }
   * @private
   */
  _registerProviders() {
    for (const [name, providerConfig] of Object.entries(this.config.providers)) {
      // Custom provider: user passes { provider: MyProvider, clientId, clientSecret }
      if (providerConfig.provider) {
        const CustomClass = providerConfig.provider;
        if (typeof CustomClass !== 'function') {
          throw new ConfigError(
            `Provider "${name}" has an invalid "provider" value — must be a class extending BaseProvider`
          );
        }
        this.providers.set(name, new CustomClass(providerConfig));
        continue;
      }

      // Built-in provider by name
      const ProviderClass = BUILT_IN_PROVIDERS[name];
      if (!ProviderClass) {
        throw new ConfigError(
          `Unknown provider "${name}". Supported: ${Object.keys(BUILT_IN_PROVIDERS).join(', ')}. For custom providers, pass { provider: YourProviderClass }`
        );
      }
      this.providers.set(name, new ProviderClass(providerConfig));
    }
  }

  /**
   * Get a registered provider by name.
   * @param {string} name
   * @returns {import('../providers/base.js').BaseProvider}
   */
  getProvider(name) {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new ConfigError(`Provider "${name}" is not configured`);
    }
    return provider;
  }

  /**
   * Returns an Express middleware/router that mounts all auth routes.
   * @example
   * app.use(auth.express());
   * @returns {import('express').Router}
   */
  express() {
    return createExpressAdapter(this);
  }

  /**
   * Returns a Fastify plugin that registers all auth routes.
   * @example
   * fastify.register(auth.fastify());
   * @returns {Function} Fastify plugin
   */
  fastify() {
    return createFastifyAdapter(this);
  }

  /**
   * Returns a function that creates a Hono sub-app with auth routes.
   * @example
   * import { Hono } from 'hono';
   * app.route('', auth.hono()(Hono));
   * @returns {Function}
   */
  hono() {
    return createHonoAdapter(this);
  }

  /**
   * Returns middleware that protects routes — only authenticated users pass through.
   * Works with Express, Fastify (via preHandler), and Hono.
   *
   * @example
   * // Express
   * app.get('/dashboard', auth.protect(), (req, res) => { ... });
   *
   * // Fastify
   * fastify.get('/dashboard', { preHandler: auth.protect() }, (req, reply) => { ... });
   *
   * @param {Object} [options]
   * @param {string} [options.redirect] - Redirect URL for unauthenticated users
   * @returns {Function}
   */
  protect(options = {}) {
    return createProtectMiddleware(this.sessionManager, options);
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  on(event, listener) {
    this._emitter.on(event, listener);
    return this;
  }

  /**
   * Subscribe to an event once.
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  once(event, listener) {
    this._emitter.once(event, listener);
    return this;
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} listener
   * @returns {this}
   */
  off(event, listener) {
    this._emitter.off(event, listener);
    return this;
  }

  /**
   * Emit an event safely — listener errors are caught and logged
   * so they never break the auth flow.
   * @param {string} event
   * @param {Object} data
   */
  emit(event, data) {
    try {
      this._emitter.emit(event, data);
    } catch {
      // Listener errors must not break the auth flow
    }
  }
}
