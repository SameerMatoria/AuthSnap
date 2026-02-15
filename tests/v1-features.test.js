import { describe, it, expect } from 'vitest';
import { AuthSnap, BaseProvider, TokenStore, createProtectMiddleware, createRateLimiter } from '../src/index.js';

const SESSION = { secret: 'test-secret-at-least-32-characters-long!' };

// ── Custom Provider ───────────────────────────────────────────

class FakeLinkedInProvider extends BaseProvider {
  constructor(config) {
    super('linkedin', config, {
      authorization: 'https://www.linkedin.com/oauth/v2/authorization',
      token: 'https://www.linkedin.com/oauth/v2/accessToken',
      userinfo: 'https://api.linkedin.com/v2/me',
    }, ['r_liteprofile', 'r_emailaddress']);
  }

  async getProfile(accessToken) {
    return {
      id: 'li-123',
      email: 'user@linkedin.com',
      name: 'LinkedIn User',
      avatar: null,
      provider: 'linkedin',
      emailVerified: true,
      raw: {},
    };
  }
}

describe('Custom Provider Support', () => {
  it('should accept a custom provider class via config', () => {
    const auth = new AuthSnap({
      providers: {
        linkedin: {
          provider: FakeLinkedInProvider,
          clientId: 'li-id',
          clientSecret: 'li-sec',
        },
      },
      session: SESSION,
    });

    expect(auth.providers.size).toBe(1);
    const linkedin = auth.getProvider('linkedin');
    expect(linkedin).toBeInstanceOf(FakeLinkedInProvider);
    expect(linkedin).toBeInstanceOf(BaseProvider);
    expect(linkedin.name).toBe('linkedin');
  });

  it('should generate authorization URL for custom provider', () => {
    const auth = new AuthSnap({
      providers: {
        linkedin: {
          provider: FakeLinkedInProvider,
          clientId: 'li-id',
          clientSecret: 'li-sec',
        },
      },
      session: SESSION,
    });

    const provider = auth.getProvider('linkedin');
    const url = provider.getAuthorizationURL('http://localhost/callback', 'state123');
    expect(url).toContain('linkedin.com/oauth/v2/authorization');
    expect(url).toContain('client_id=li-id');
    expect(url).toContain('state=state123');
  });

  it('should use custom default scopes', () => {
    const auth = new AuthSnap({
      providers: {
        linkedin: {
          provider: FakeLinkedInProvider,
          clientId: 'li-id',
          clientSecret: 'li-sec',
        },
      },
      session: SESSION,
    });

    const provider = auth.getProvider('linkedin');
    expect(provider.scopes).toContain('r_liteprofile');
    expect(provider.scopes).toContain('r_emailaddress');
  });

  it('should allow overriding scopes on custom provider', () => {
    const auth = new AuthSnap({
      providers: {
        linkedin: {
          provider: FakeLinkedInProvider,
          clientId: 'li-id',
          clientSecret: 'li-sec',
          scopes: ['openid'],
        },
      },
      session: SESSION,
    });

    const provider = auth.getProvider('linkedin');
    expect(provider.scopes).toEqual(['openid']);
  });

  it('should mix custom and built-in providers', () => {
    const auth = new AuthSnap({
      providers: {
        google: { clientId: 'gid', clientSecret: 'gsec' },
        linkedin: {
          provider: FakeLinkedInProvider,
          clientId: 'li-id',
          clientSecret: 'li-sec',
        },
      },
      session: SESSION,
    });

    expect(auth.providers.size).toBe(2);
    expect(auth.getProvider('google').name).toBe('google');
    expect(auth.getProvider('linkedin').name).toBe('linkedin');
  });

  it('should throw for invalid custom provider value', () => {
    expect(() => new AuthSnap({
      providers: {
        custom: {
          provider: 'not-a-class',
          clientId: 'cid',
          clientSecret: 'csec',
        },
      },
      session: SESSION,
    })).toThrow('invalid "provider" value');
  });
});

// ── Pluggable Token Store ─────────────────────────────────────

describe('Pluggable Token Store', () => {
  it('should use the default TokenStore when none provided', () => {
    const auth = new AuthSnap({
      providers: { google: { clientId: 'gid', clientSecret: 'gsec' } },
      session: SESSION,
    });
    expect(auth.tokenStore).toBeInstanceOf(TokenStore);
  });

  it('should use a custom token store when provided', () => {
    const customStore = {
      _data: new Map(),
      async get(key) { return this._data.get(key) || null; },
      async set(key, value) { this._data.set(key, value); },
      async delete(key) { return this._data.delete(key); },
      async has(key) { return this._data.has(key); },
      async isExpired() { return false; },
    };

    const auth = new AuthSnap({
      providers: { google: { clientId: 'gid', clientSecret: 'gsec' } },
      session: SESSION,
      tokenStore: customStore,
    });

    expect(auth.tokenStore).toBe(customStore);
    expect(auth.tokenStore).not.toBeInstanceOf(TokenStore);
  });

  it('should pass custom store to TokenRefresher', () => {
    const customStore = {
      async get() { return null; },
      async set() {},
      async delete() { return false; },
      async has() { return false; },
      async isExpired() { return true; },
    };

    const auth = new AuthSnap({
      providers: { google: { clientId: 'gid', clientSecret: 'gsec' } },
      session: SESSION,
      tokenStore: customStore,
    });

    // TokenRefresher reads from authSnap.tokenStore
    expect(auth.tokenRefresher.authSnap.tokenStore).toBe(customStore);
  });
});

// ── Standalone Exports ────────────────────────────────────────

describe('Standalone Exports', () => {
  it('should export createProtectMiddleware as a function', () => {
    expect(typeof createProtectMiddleware).toBe('function');
  });

  it('should export createRateLimiter as a function', () => {
    expect(typeof createRateLimiter).toBe('function');
  });

  it('should export BaseProvider as a class', () => {
    expect(typeof BaseProvider).toBe('function');
    expect(BaseProvider.prototype.getAuthorizationURL).toBeDefined();
    expect(BaseProvider.prototype.exchangeCode).toBeDefined();
    expect(BaseProvider.prototype.getProfile).toBeDefined();
  });
});
