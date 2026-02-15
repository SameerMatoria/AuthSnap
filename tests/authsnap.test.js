import { describe, it, expect } from 'vitest';
import { AuthSnap, ConfigError, GoogleProvider, GitHubProvider, DiscordProvider, TwitterProvider, AppleProvider, MicrosoftProvider, LinkedInProvider, SpotifyProvider, TokenStore, TokenRefresher } from '../src/index.js';

describe('AuthSnap', () => {
  const validConfig = {
    providers: {
      google: {
        clientId: 'google-client-id',
        clientSecret: 'google-client-secret',
      },
      github: {
        clientId: 'github-client-id',
        clientSecret: 'github-client-secret',
      },
    },
    session: { secret: 'test-secret-at-least-32-characters-long!' },
  };

  it('should instantiate with valid config', () => {
    const auth = new AuthSnap(validConfig);
    expect(auth).toBeInstanceOf(AuthSnap);
    expect(auth.providers.size).toBe(2);
  });

  it('should register Google provider', () => {
    const auth = new AuthSnap(validConfig);
    const google = auth.getProvider('google');
    expect(google).toBeInstanceOf(GoogleProvider);
    expect(google.name).toBe('google');
  });

  it('should register GitHub provider', () => {
    const auth = new AuthSnap(validConfig);
    const github = auth.getProvider('github');
    expect(github).toBeInstanceOf(GitHubProvider);
    expect(github.name).toBe('github');
  });

  it('should register Discord and Twitter providers', () => {
    const auth = new AuthSnap({
      providers: {
        discord: { clientId: 'did', clientSecret: 'dsec' },
        twitter: { clientId: 'tid', clientSecret: 'tsec' },
      },
      session: { secret: 'test-secret-at-least-32-characters-long!' },
    });
    expect(auth.getProvider('discord')).toBeInstanceOf(DiscordProvider);
    expect(auth.getProvider('twitter')).toBeInstanceOf(TwitterProvider);
    expect(auth.providers.size).toBe(2);
  });

  it('should register Apple and Microsoft providers', () => {
    const auth = new AuthSnap({
      providers: {
        apple: { clientId: 'apple-id', clientSecret: 'apple-sec' },
        microsoft: { clientId: 'ms-id', clientSecret: 'ms-sec' },
      },
      session: { secret: 'test-secret-at-least-32-characters-long!' },
    });
    expect(auth.getProvider('apple')).toBeInstanceOf(AppleProvider);
    expect(auth.getProvider('microsoft')).toBeInstanceOf(MicrosoftProvider);
    expect(auth.providers.size).toBe(2);
  });

  it('should register LinkedIn and Spotify providers', () => {
    const auth = new AuthSnap({
      providers: {
        linkedin: { clientId: 'li-id', clientSecret: 'li-sec' },
        spotify: { clientId: 'sp-id', clientSecret: 'sp-sec' },
      },
      session: { secret: 'test-secret-at-least-32-characters-long!' },
    });
    expect(auth.getProvider('linkedin')).toBeInstanceOf(LinkedInProvider);
    expect(auth.getProvider('spotify')).toBeInstanceOf(SpotifyProvider);
    expect(auth.providers.size).toBe(2);
  });

  it('should have a TokenRefresher instance', () => {
    const auth = new AuthSnap(validConfig);
    expect(auth.tokenRefresher).toBeDefined();
  });

  it('should have a TokenStore instance', () => {
    const auth = new AuthSnap(validConfig);
    expect(auth.tokenStore).toBeInstanceOf(TokenStore);
  });

  it('should return a Fastify plugin', () => {
    const auth = new AuthSnap(validConfig);
    const plugin = auth.fastify();
    expect(typeof plugin).toBe('function');
  });

  it('should return a Hono adapter function', () => {
    const auth = new AuthSnap(validConfig);
    const adapter = auth.hono();
    expect(typeof adapter).toBe('function');
  });

  it('should throw for unknown provider', () => {
    expect(
      () =>
        new AuthSnap({
          providers: { unknown: { clientId: 'x', clientSecret: 'y' } },
          session: { secret: 's' },
        })
    ).toThrow('Unknown provider "unknown"');
  });

  it('should throw when getting an unconfigured provider', () => {
    const auth = new AuthSnap({
      providers: { google: { clientId: 'x', clientSecret: 'y' } },
      session: { secret: 's' },
    });
    expect(() => auth.getProvider('github')).toThrow(ConfigError);
  });

  it('should return an Express router', () => {
    const auth = new AuthSnap(validConfig);
    const router = auth.express();
    expect(typeof router).toBe('function'); // Express router is a function
  });

  it('should return a protect middleware', () => {
    const auth = new AuthSnap(validConfig);
    const middleware = auth.protect();
    expect(typeof middleware).toBe('function');
  });
});

describe('GoogleProvider', () => {
  const provider = new GoogleProvider({
    clientId: 'google-id',
    clientSecret: 'google-secret',
    scopes: ['email', 'profile'],
  });

  it('should generate a valid authorization URL', () => {
    const url = provider.getAuthorizationURL('http://localhost:3000/auth/google/callback', 'state123');
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('client_id=google-id');
    expect(url).toContain('state=state123');
    expect(url).toContain('redirect_uri=');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=select_account+consent');
  });

  it('should use default scopes when none specified', () => {
    const p = new GoogleProvider({ clientId: 'id', clientSecret: 'sec' });
    expect(p.scopes).toContain('openid');
    expect(p.scopes).toContain('email');
    expect(p.scopes).toContain('profile');
  });
});

describe('GitHubProvider', () => {
  const provider = new GitHubProvider({
    clientId: 'github-id',
    clientSecret: 'github-secret',
  });

  it('should generate a valid authorization URL', () => {
    const url = provider.getAuthorizationURL('http://localhost:3000/auth/github/callback', 'state456');
    expect(url).toContain('github.com/login/oauth/authorize');
    expect(url).toContain('client_id=github-id');
    expect(url).toContain('state=state456');
  });

  it('should use default scopes', () => {
    expect(provider.scopes).toContain('read:user');
    expect(provider.scopes).toContain('user:email');
  });
});
