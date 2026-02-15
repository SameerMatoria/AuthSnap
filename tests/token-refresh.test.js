import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenRefresher } from '../src/session/token-refresh.js';
import { TokenStore } from '../src/session/token-store.js';

/**
 * Build a minimal mock AuthSnap object for testing TokenRefresher.
 */
function createMockAuthSnap(overrides = {}) {
  const tokenStore = new TokenStore();
  return {
    tokenStore,
    config: {
      callbacks: overrides.callbacks || {},
    },
    getProvider: vi.fn(() => ({
      name: 'google',
      config: { clientId: 'cid', clientSecret: 'csec' },
      endpoints: { token: 'https://oauth2.googleapis.com/token' },
    })),
    emit: vi.fn(),
    ...overrides,
  };
}

describe('TokenRefresher', () => {
  let authSnap;
  let refresher;

  beforeEach(() => {
    authSnap = createMockAuthSnap();
    refresher = new TokenRefresher(authSnap);
  });

  it('should return null when no tokens exist', async () => {
    const result = await refresher.getValidTokens('google', 'user1');
    expect(result).toBeNull();
  });

  it('should return current tokens if not expired', async () => {
    const tokens = {
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3600 * 1000, // 1 hour from now
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    const result = await refresher.getValidTokens('google', 'user1');
    expect(result.accessToken).toBe('valid-token');
  });

  it('should return null when expired with no refresh token', async () => {
    const tokens = {
      accessToken: 'expired-token',
      refreshToken: null,
      expiresAt: Date.now() - 1000, // expired
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    const result = await refresher.getValidTokens('google', 'user1');
    expect(result).toBeNull();
  });

  it('should return null from forceRefresh when no tokens exist', async () => {
    const result = await refresher.forceRefresh('google', 'user1');
    expect(result).toBeNull();
  });

  it('should return null from forceRefresh when no refresh token', async () => {
    const tokens = {
      accessToken: 'token',
      refreshToken: null,
      expiresAt: Date.now() + 3600 * 1000,
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    const result = await refresher.forceRefresh('google', 'user1');
    expect(result).toBeNull();
  });

  it('should delete tokens when refresh fails', async () => {
    const tokens = {
      accessToken: 'expired-token',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() - 1000,
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    // Mock fetch to simulate a failed refresh
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('invalid_grant') })
    );

    const result = await refresher.getValidTokens('google', 'user1');
    expect(result).toBeNull();

    // Tokens should be deleted from the store
    const stored = await authSnap.tokenStore.get(key);
    expect(stored).toBeNull();

    global.fetch = undefined;
  });

  it('should refresh expired tokens and update the store', async () => {
    const tokens = {
      accessToken: 'old-token',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() - 1000,
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    // Mock a successful refresh response
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-token',
            refresh_token: null,
            expires_in: 3600,
            token_type: 'Bearer',
          }),
      })
    );

    const result = await refresher.getValidTokens('google', 'user1');
    expect(result.accessToken).toBe('new-token');
    // Should keep the old refresh token when provider doesn't issue a new one
    expect(result.refreshToken).toBe('valid-refresh');

    // Store should be updated
    const stored = await authSnap.tokenStore.get(key);
    expect(stored.accessToken).toBe('new-token');

    global.fetch = undefined;
  });

  it('should use the new refresh token when provider issues one', async () => {
    const tokens = {
      accessToken: 'old-token',
      refreshToken: 'old-refresh',
      expiresAt: Date.now() - 1000,
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
      })
    );

    const result = await refresher.getValidTokens('google', 'user1');
    expect(result.refreshToken).toBe('new-refresh');

    global.fetch = undefined;
  });

  it('should fire onTokenRefresh callback after successful refresh', async () => {
    const onTokenRefresh = vi.fn();
    authSnap = createMockAuthSnap({ callbacks: { onTokenRefresh } });
    refresher = new TokenRefresher(authSnap);

    const tokens = {
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000,
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'refreshed',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
      })
    );

    await refresher.getValidTokens('google', 'user1');
    expect(onTokenRefresh).toHaveBeenCalledOnce();
    expect(onTokenRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'refreshed' }),
      'google'
    );

    global.fetch = undefined;
  });

  it('should force refresh even when tokens are not expired', async () => {
    const tokens = {
      accessToken: 'current-valid',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600 * 1000, // not expired
      tokenType: 'Bearer',
      scope: null,
    };
    const key = TokenStore.key('google', 'user1');
    await authSnap.tokenStore.set(key, tokens);

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'force-refreshed',
            expires_in: 3600,
            token_type: 'Bearer',
          }),
      })
    );

    const result = await refresher.forceRefresh('google', 'user1');
    expect(result.accessToken).toBe('force-refreshed');

    global.fetch = undefined;
  });
});
