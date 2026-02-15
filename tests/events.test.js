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

describe('Event System', () => {
  it('should expose on/off/once/emit methods', () => {
    const auth = makeAuth();
    expect(typeof auth.on).toBe('function');
    expect(typeof auth.off).toBe('function');
    expect(typeof auth.once).toBe('function');
    expect(typeof auth.emit).toBe('function');
  });

  it('on() should return this for chaining', () => {
    const auth = makeAuth();
    const result = auth.on('login', () => {});
    expect(result).toBe(auth);
  });

  it('should emit "login" event from handleLogin', () => {
    const auth = makeAuth();
    const listener = vi.fn();
    auth.on('login', listener);

    handleLogin(auth, 'google', 'http://localhost:3000/auth/google/callback', {});

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    );
  });

  it('should emit "logout" event from handleLogout', () => {
    const auth = makeAuth();
    const listener = vi.fn();
    auth.on('logout', listener);

    handleLogout(auth);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({});
  });

  it('should emit "error" event from handleCallbackError', () => {
    const auth = makeAuth();
    const listener = vi.fn();
    auth.on('error', listener);

    const err = new Error('test error');
    handleCallbackError(auth, 'google', err);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith({ error: err, provider: 'google' });
  });

  it('once() should fire only once', () => {
    const auth = makeAuth();
    const listener = vi.fn();
    auth.once('logout', listener);

    handleLogout(auth);
    handleLogout(auth);

    expect(listener).toHaveBeenCalledOnce();
  });

  it('off() should remove a listener', () => {
    const auth = makeAuth();
    const listener = vi.fn();
    auth.on('logout', listener);
    auth.off('logout', listener);

    handleLogout(auth);

    expect(listener).not.toHaveBeenCalled();
  });

  it('should not break auth flow when listener throws', () => {
    const auth = makeAuth();
    auth.on('login', () => {
      throw new Error('listener boom');
    });

    // Should not throw
    expect(() =>
      handleLogin(auth, 'google', 'http://localhost:3000/auth/google/callback', {})
    ).not.toThrow();
  });

  it('emit() should not throw when no listeners are registered', () => {
    const auth = makeAuth();
    expect(() => auth.emit('login', { provider: 'google' })).not.toThrow();
  });

  it('should support multiple listeners on the same event', () => {
    const auth = makeAuth();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    auth.on('logout', listener1);
    auth.on('logout', listener2);

    handleLogout(auth);

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });
});
