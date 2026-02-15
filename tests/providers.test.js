import { describe, it, expect } from 'vitest';
import { DiscordProvider } from '../src/providers/discord.js';
import { TwitterProvider } from '../src/providers/twitter.js';
import { AppleProvider } from '../src/providers/apple.js';
import { MicrosoftProvider } from '../src/providers/microsoft.js';
import { LinkedInProvider } from '../src/providers/linkedin.js';
import { SpotifyProvider } from '../src/providers/spotify.js';

describe('DiscordProvider', () => {
  const provider = new DiscordProvider({
    clientId: 'discord-id',
    clientSecret: 'discord-secret',
    scopes: ['identify', 'email', 'guilds'],
  });

  it('should generate a valid authorization URL', () => {
    const url = provider.getAuthorizationURL(
      'http://localhost:3000/auth/discord/callback',
      'state123'
    );
    expect(url).toContain('discord.com/api/oauth2/authorize');
    expect(url).toContain('client_id=discord-id');
    expect(url).toContain('state=state123');
    expect(url).toContain('scope=identify+email+guilds');
  });

  it('should use default scopes when none specified', () => {
    const p = new DiscordProvider({ clientId: 'id', clientSecret: 'sec' });
    expect(p.scopes).toContain('identify');
    expect(p.scopes).toContain('email');
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('discord');
  });

  it('should have correct endpoints', () => {
    expect(provider.endpoints.authorization).toContain('discord.com');
    expect(provider.endpoints.token).toContain('discord.com');
    expect(provider.endpoints.userinfo).toContain('discord.com');
  });
});

describe('TwitterProvider', () => {
  const provider = new TwitterProvider({
    clientId: 'twitter-id',
    clientSecret: 'twitter-secret',
  });

  it('should generate an authorization URL with PKCE', () => {
    const url = provider.getAuthorizationURL(
      'http://localhost:3000/auth/twitter/callback',
      'state456'
    );
    expect(url).toContain('twitter.com/i/oauth2/authorize');
    expect(url).toContain('client_id=twitter-id');
    expect(url).toContain('state=state456');
    expect(url).toContain('code_challenge=state456');
    expect(url).toContain('code_challenge_method=plain');
  });

  it('should use default scopes', () => {
    expect(provider.scopes).toContain('users.read');
    expect(provider.scopes).toContain('tweet.read');
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('twitter');
  });
});

describe('AppleProvider', () => {
  const provider = new AppleProvider({
    clientId: 'com.example.auth',
    clientSecret: 'apple-secret',
  });

  it('should generate an authorization URL with response_mode=form_post', () => {
    const url = provider.getAuthorizationURL(
      'http://localhost:3000/auth/apple/callback',
      'state789'
    );
    expect(url).toContain('appleid.apple.com/auth/authorize');
    expect(url).toContain('client_id=com.example.auth');
    expect(url).toContain('state=state789');
    expect(url).toContain('response_mode=form_post');
    expect(url).toContain('response_type=code');
  });

  it('should use default scopes', () => {
    expect(provider.scopes).toContain('name');
    expect(provider.scopes).toContain('email');
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('apple');
  });

  it('should have null userinfo endpoint', () => {
    expect(provider.endpoints.userinfo).toBeNull();
  });

  it('should parse profile from id_token', async () => {
    // Create a minimal JWT (header.payload.signature) with Apple claims
    const payload = {
      sub: 'apple-user-001',
      email: 'user@privaterelay.appleid.com',
      email_verified: true,
    };
    const header = btoa(JSON.stringify({ alg: 'none' }));
    const body = btoa(JSON.stringify(payload));
    const fakeIdToken = `${header}.${body}.`;

    const profile = await provider.getProfile('fake-access-token', {
      idToken: fakeIdToken,
    });

    expect(profile.id).toBe('apple-user-001');
    expect(profile.email).toBe('user@privaterelay.appleid.com');
    expect(profile.provider).toBe('apple');
    expect(profile.avatar).toBeNull();
    expect(profile.emailVerified).toBe(true);
  });

  it('should include user name from first auth', async () => {
    const payload = { sub: '002', email: 'test@apple.com', email_verified: 'true' };
    const fakeIdToken = `${btoa(JSON.stringify({ alg: 'none' }))}.${btoa(JSON.stringify(payload))}.`;

    const profile = await provider.getProfile('token', {
      idToken: fakeIdToken,
      user: { name: { firstName: 'John', lastName: 'Doe' } },
    });

    expect(profile.name).toBe('John Doe');
  });

  it('should throw without id_token', async () => {
    await expect(provider.getProfile('token')).rejects.toThrow('id_token');
  });
});

describe('MicrosoftProvider', () => {
  const provider = new MicrosoftProvider({
    clientId: 'ms-client-id',
    clientSecret: 'ms-client-secret',
  });

  it('should generate a valid authorization URL', () => {
    const url = provider.getAuthorizationURL(
      'http://localhost:3000/auth/microsoft/callback',
      'stateABC'
    );
    expect(url).toContain('login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(url).toContain('client_id=ms-client-id');
    expect(url).toContain('state=stateABC');
    expect(url).toContain('response_mode=query');
  });

  it('should use default scopes', () => {
    expect(provider.scopes).toContain('openid');
    expect(provider.scopes).toContain('email');
    expect(provider.scopes).toContain('profile');
    expect(provider.scopes).toContain('User.Read');
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('microsoft');
  });

  it('should support custom tenant', () => {
    const p = new MicrosoftProvider({
      clientId: 'id',
      clientSecret: 'sec',
      tenant: 'my-tenant-id',
    });
    expect(p.endpoints.authorization).toContain('my-tenant-id');
    expect(p.endpoints.token).toContain('my-tenant-id');
  });

  it('should default to common tenant', () => {
    expect(provider.endpoints.authorization).toContain('/common/');
    expect(provider.endpoints.token).toContain('/common/');
  });

  it('should have correct userinfo endpoint', () => {
    expect(provider.endpoints.userinfo).toBe('https://graph.microsoft.com/v1.0/me');
  });
});

describe('LinkedInProvider', () => {
  const provider = new LinkedInProvider({
    clientId: 'linkedin-id',
    clientSecret: 'linkedin-secret',
  });

  it('should generate a valid authorization URL', () => {
    const url = provider.getAuthorizationURL(
      'http://localhost:3000/auth/linkedin/callback',
      'stateLI'
    );
    expect(url).toContain('linkedin.com/oauth/v2/authorization');
    expect(url).toContain('client_id=linkedin-id');
    expect(url).toContain('state=stateLI');
  });

  it('should use default scopes', () => {
    expect(provider.scopes).toContain('openid');
    expect(provider.scopes).toContain('profile');
    expect(provider.scopes).toContain('email');
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('linkedin');
  });

  it('should have correct endpoints', () => {
    expect(provider.endpoints.authorization).toContain('linkedin.com');
    expect(provider.endpoints.token).toContain('linkedin.com');
    expect(provider.endpoints.userinfo).toContain('linkedin.com');
  });
});

describe('SpotifyProvider', () => {
  const provider = new SpotifyProvider({
    clientId: 'spotify-id',
    clientSecret: 'spotify-secret',
  });

  it('should generate a valid authorization URL', () => {
    const url = provider.getAuthorizationURL(
      'http://localhost:3000/auth/spotify/callback',
      'stateSP'
    );
    expect(url).toContain('accounts.spotify.com/authorize');
    expect(url).toContain('client_id=spotify-id');
    expect(url).toContain('state=stateSP');
  });

  it('should use default scopes', () => {
    expect(provider.scopes).toContain('user-read-private');
    expect(provider.scopes).toContain('user-read-email');
  });

  it('should have the correct name', () => {
    expect(provider.name).toBe('spotify');
  });

  it('should have correct endpoints', () => {
    expect(provider.endpoints.authorization).toContain('spotify.com');
    expect(provider.endpoints.token).toContain('spotify.com');
    expect(provider.endpoints.userinfo).toContain('spotify.com');
  });
});
