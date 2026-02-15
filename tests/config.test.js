import { describe, it, expect } from 'vitest';
import { validateConfig } from '../src/core/config.js';
import { ConfigError } from '../src/core/errors.js';

describe('validateConfig', () => {
  const validConfig = {
    providers: {
      google: {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      },
    },
    session: { secret: 'test-secret' },
  };

  it('should accept a valid configuration', () => {
    const result = validateConfig(validConfig);
    expect(result.providers.google.clientId).toBe('test-client-id');
    expect(result.session.strategy).toBe('jwt');
    expect(result.basePath).toBe('/auth');
  });

  it('should throw if config is missing', () => {
    expect(() => validateConfig(null)).toThrow(ConfigError);
    expect(() => validateConfig(undefined)).toThrow(ConfigError);
  });

  it('should throw if no providers are configured', () => {
    expect(() => validateConfig({ providers: {}, session: { secret: 's' } })).toThrow(
      'At least one provider'
    );
  });

  it('should throw if provider is missing clientId', () => {
    expect(() =>
      validateConfig({
        providers: { google: { clientSecret: 's' } },
        session: { secret: 's' },
      })
    ).toThrow('missing clientId');
  });

  it('should throw if provider is missing clientSecret', () => {
    expect(() =>
      validateConfig({
        providers: { google: { clientId: 'id' } },
        session: { secret: 's' },
      })
    ).toThrow('missing clientSecret');
  });

  it('should throw if session secret is missing', () => {
    expect(() =>
      validateConfig({
        providers: { google: { clientId: 'id', clientSecret: 's' } },
      })
    ).toThrow('Session secret is required');
  });

  it('should apply default session values', () => {
    const result = validateConfig(validConfig);
    expect(result.session.strategy).toBe('jwt');
    expect(result.session.maxAge).toBe(86400);
    expect(result.session.cookieName).toBe('authsnap_session');
    expect(result.session.secure).toBe(true);
  });

  it('should allow overriding session defaults', () => {
    const result = validateConfig({
      ...validConfig,
      session: { secret: 's', maxAge: 3600, cookieName: 'my_session', secure: false },
    });
    expect(result.session.maxAge).toBe(3600);
    expect(result.session.cookieName).toBe('my_session');
    expect(result.session.secure).toBe(false);
  });

  it('should allow custom basePath', () => {
    const result = validateConfig({ ...validConfig, basePath: '/api/auth' });
    expect(result.basePath).toBe('/api/auth');
  });
});
