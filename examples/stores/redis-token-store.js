/**
 * Redis-backed TokenStore for AuthSnap.
 *
 * Drop-in replacement for the default in-memory TokenStore.
 * Requires `ioredis` or `redis` package — pass your client instance.
 *
 * @example
 * import Redis from 'ioredis';
 * import { AuthSnap } from 'authsnap';
 * import { RedisTokenStore } from './stores/redis-token-store.js';
 *
 * const redis = new Redis();
 * const auth = new AuthSnap({
 *   providers: { google: { clientId: '...', clientSecret: '...' } },
 *   session: { secret: process.env.SESSION_SECRET },
 *   tokenStore: new RedisTokenStore(redis),
 * });
 */
export class RedisTokenStore {
  /**
   * @param {import('ioredis').Redis} redis - Redis client instance
   * @param {string} [prefix='authsnap:tokens:'] - Key prefix
   */
  constructor(redis, prefix = 'authsnap:tokens:') {
    this.redis = redis;
    this.prefix = prefix;
  }

  _key(key) {
    return `${this.prefix}${key}`;
  }

  async set(key, tokens) {
    const data = JSON.stringify(tokens);
    if (tokens.expiresAt) {
      const ttl = Math.max(1, Math.ceil((tokens.expiresAt - Date.now()) / 1000));
      await this.redis.set(this._key(key), data, 'EX', ttl);
    } else {
      await this.redis.set(this._key(key), data);
    }
  }

  async get(key) {
    const data = await this.redis.get(this._key(key));
    return data ? JSON.parse(data) : null;
  }

  async has(key) {
    const exists = await this.redis.exists(this._key(key));
    return exists === 1;
  }

  async delete(key) {
    const result = await this.redis.del(this._key(key));
    return result > 0;
  }

  async isExpired(key) {
    const tokens = await this.get(key);
    if (!tokens || !tokens.expiresAt) return false;
    return Date.now() >= tokens.expiresAt;
  }

  async clear() {
    const keys = await this.redis.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
