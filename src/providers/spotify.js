import { BaseProvider } from './base.js';

const SPOTIFY_ENDPOINTS = {
  authorization: 'https://accounts.spotify.com/authorize',
  token: 'https://accounts.spotify.com/api/token',
  userinfo: 'https://api.spotify.com/v1/me',
};

const DEFAULT_SCOPES = ['user-read-private', 'user-read-email'];

/**
 * Spotify OAuth 2.0 provider.
 *
 * @example
 * providers: {
 *   spotify: { clientId: 'xxx', clientSecret: 'xxx' }
 * }
 */
export class SpotifyProvider extends BaseProvider {
  constructor(config) {
    super('spotify', config, SPOTIFY_ENDPOINTS, DEFAULT_SCOPES);
  }

  /**
   * Fetch and normalize the Spotify user profile.
   * @param {string} accessToken
   * @returns {Promise<import('../core/config.js').AuthUser>}
   */
  async getProfile(accessToken) {
    const raw = await this._apiGet(this.endpoints.userinfo, accessToken);

    const avatar = raw.images?.length > 0 ? raw.images[0].url : null;

    return {
      id: raw.id,
      email: raw.email || '',
      name: raw.display_name || raw.id,
      avatar,
      provider: 'spotify',
      emailVerified: false, // Spotify API does not expose email_verified
      raw,
    };
  }
}
