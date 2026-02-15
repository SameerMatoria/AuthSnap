import { describe, it, expect, vi } from 'vitest';
import { AuthSnap } from '../src/index.js';
import { handleLogin, handleCallback, handleCallbackError, handleLogout } from '../src/core/route-handler.js';

const makeAuth = (overrides = {}) =>
  new AuthSnap({
    providers: {
      google: { clientId: 'gid', clientSecret: 'gsec' },
    },
    session: { secret: 'test-secret-at-least-32-characters-long!' },
    ...overrides,
  });

describe('handleLogin', () => {
  it('should return a redirect URL, state, and secure flag', () => {
    const auth = makeAuth();
    const result = handleLogin(auth, 'google', 'http://localhost/auth/google/callback', {});

    expect(result.redirectURL).toContain('accounts.google.com');
    expect(result.redirectURL).toContain('client_id=gid');
    expect(result.state).toHaveLength(64); // 32 bytes → 64 hex chars
    expect(typeof result.secure).toBe('boolean');
  });

  it('should fire onBeforeAuth callback', () => {
    const onBeforeAuth = vi.fn();
    const auth = makeAuth({ callbacks: { onBeforeAuth } });
    const req = { ip: '127.0.0.1' };

    handleLogin(auth, 'google', 'http://localhost/callback', req);
    expect(onBeforeAuth).toHaveBeenCalledWith('google', req);
  });
});

describe('handleCallbackError', () => {
  it('should return error redirect from onError callback', () => {
    const onError = vi.fn(() => ({ redirect: '/login?error=true' }));
    const auth = makeAuth({ callbacks: { onError } });

    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('/login?error=true');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'google');
  });

  it('should fall back to /auth/error when no callback', () => {
    const auth = makeAuth();
    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('/auth/error');
  });
});

describe('handleLogout', () => {
  it('should return a clear-cookie header', () => {
    const auth = makeAuth();
    const result = handleLogout(auth);
    expect(result.clearCookie).toContain('authsnap_session=');
    expect(result.clearCookie).toContain('Max-Age=0');
  });
});

describe('Redirect Validation', () => {
  it('should allow relative paths in error redirect', () => {
    const onError = vi.fn(() => ({ redirect: '/login?error=true' }));
    const auth = makeAuth({ callbacks: { onError } });
    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('/login?error=true');
  });

  it('should block absolute URLs when no allowedRedirects is set', () => {
    const onError = vi.fn(() => ({ redirect: 'https://evil.com/steal' }));
    const auth = makeAuth({ callbacks: { onError } });
    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('/');
  });

  it('should block protocol-relative URLs', () => {
    const onError = vi.fn(() => ({ redirect: '//evil.com/steal' }));
    const auth = makeAuth({ callbacks: { onError } });
    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('/');
  });

  it('should allow absolute URLs matching allowedRedirects', () => {
    const onError = vi.fn(() => ({ redirect: 'https://myapp.com/dashboard' }));
    const auth = makeAuth({
      callbacks: { onError },
      allowedRedirects: ['https://myapp.com'],
    });
    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('https://myapp.com/dashboard');
  });

  it('should block absolute URLs not in allowedRedirects', () => {
    const onError = vi.fn(() => ({ redirect: 'https://evil.com/steal' }));
    const auth = makeAuth({
      callbacks: { onError },
      allowedRedirects: ['https://myapp.com'],
    });
    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('/');
  });

  it('should fall back to /auth/error for default error redirect', () => {
    const auth = makeAuth();
    const result = handleCallbackError(auth, 'google', new Error('fail'));
    expect(result.redirectURL).toBe('/auth/error');
  });
});
