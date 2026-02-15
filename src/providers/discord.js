import { BaseProvider } from './base.js';

const DISCORD_ENDPOINTS = {
  authorization: 'https://discord.com/api/oauth2/authorize',
  token: 'https://discord.com/api/oauth2/token',
  userinfo: 'https://discord.com/api/users/@me',
};

const DEFAULT_SCOPES = ['identify', 'email'];

/**
 * Discord OAuth 2.0 provider.
 *
 * Unique data: username, discriminator, guilds (if 'guilds' scope is requested).
 * Avatar URL must be constructed from the user ID + avatar hash.
 */
export class DiscordProvider extends BaseProvider {
  /** @param {import('../core/config.js').ProviderConfig} config */
  constructor(config) {
    super('discord', config, DISCORD_ENDPOINTS, DEFAULT_SCOPES);
  }

  /**
   * Discord supports `prompt=consent` to force re-showing the authorization screen.
   * @override
   */
  getAuthorizationURL(callbackURL, state) {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: callbackURL,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      prompt: this.config.prompt || 'consent',
    });

    return `${this.endpoints.authorization}?${params.toString()}`;
  }

  /**
   * Fetch and normalize the Discord user profile to AuthUser shape.
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   * @override
   */
  async getProfile(accessToken) {
    const raw = await this._apiGet(this.endpoints.userinfo, accessToken);

    // Discord avatar URL: https://cdn.discordapp.com/avatars/{user_id}/{avatar_hash}.png
    let avatar = null;
    if (raw.avatar) {
      const ext = raw.avatar.startsWith('a_') ? 'gif' : 'png';
      avatar = `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.${ext}`;
    }

    // Display name: global_name (new system) → username (legacy)
    const name = raw.global_name || raw.username;

    return {
      id: raw.id,
      email: raw.email || '',
      name,
      avatar,
      provider: 'discord',
      emailVerified: raw.verified ?? false,
      raw,
    };
  }
}
