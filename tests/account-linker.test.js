import { describe, it, expect } from 'vitest';
import { AccountLinker } from '../src/linking/account-linker.js';

describe('AccountLinker', () => {
  it('should link a provider to a user', async () => {
    const linker = new AccountLinker();
    await linker.link('user-1', 'google', 'g-123');

    const linked = await linker.isLinked('user-1', 'google');
    expect(linked).toBe(true);
  });

  it('should find user by provider', async () => {
    const linker = new AccountLinker();
    await linker.link('user-1', 'google', 'g-123');

    const userId = await linker.findByProvider('google', 'g-123');
    expect(userId).toBe('user-1');
  });

  it('should return null for unknown provider lookup', async () => {
    const linker = new AccountLinker();
    const userId = await linker.findByProvider('github', 'unknown');
    expect(userId).toBeNull();
  });

  it('should return all linked accounts for a user', async () => {
    const linker = new AccountLinker();
    await linker.link('user-1', 'google', 'g-123');
    await linker.link('user-1', 'github', 'gh-456');

    const accounts = await linker.getLinkedAccounts('user-1');
    expect(accounts).toEqual({ google: 'g-123', github: 'gh-456' });
  });

  it('should return empty object for user with no links', async () => {
    const linker = new AccountLinker();
    const accounts = await linker.getLinkedAccounts('nobody');
    expect(accounts).toEqual({});
  });

  it('should unlink a provider', async () => {
    const linker = new AccountLinker();
    await linker.link('user-1', 'google', 'g-123');
    await linker.link('user-1', 'github', 'gh-456');

    const result = await linker.unlink('user-1', 'google');
    expect(result).toBe(true);

    const linked = await linker.isLinked('user-1', 'google');
    expect(linked).toBe(false);

    // Reverse index should be cleaned up
    const userId = await linker.findByProvider('google', 'g-123');
    expect(userId).toBeNull();

    // GitHub should still be linked
    expect(await linker.isLinked('user-1', 'github')).toBe(true);
  });

  it('should return false when unlinking non-existent provider', async () => {
    const linker = new AccountLinker();
    const result = await linker.unlink('user-1', 'google');
    expect(result).toBe(false);
  });

  it('should support multiple users with different providers', async () => {
    const linker = new AccountLinker();
    await linker.link('user-1', 'google', 'g-123');
    await linker.link('user-2', 'google', 'g-456');
    await linker.link('user-2', 'github', 'gh-789');

    expect(await linker.findByProvider('google', 'g-123')).toBe('user-1');
    expect(await linker.findByProvider('google', 'g-456')).toBe('user-2');
    expect(await linker.findByProvider('github', 'gh-789')).toBe('user-2');
  });

  it('should work with a custom pluggable store', async () => {
    const customStore = {
      _data: new Map(),
      async link(userId, provider, providerId) {
        this._data.set(`${provider}:${providerId}`, userId);
      },
      async unlink(userId, provider) {
        return false;
      },
      async getLinkedAccounts(userId) {
        return {};
      },
      async findByProvider(provider, providerId) {
        return this._data.get(`${provider}:${providerId}`) || null;
      },
      async isLinked(userId, provider) {
        return false;
      },
    };

    const linker = new AccountLinker(customStore);
    await linker.link('user-1', 'google', 'g-123');

    const userId = await linker.findByProvider('google', 'g-123');
    expect(userId).toBe('user-1');
  });

  it('should clean up forward map when all providers are unlinked', async () => {
    const linker = new AccountLinker();
    await linker.link('user-1', 'google', 'g-123');
    await linker.unlink('user-1', 'google');

    const accounts = await linker.getLinkedAccounts('user-1');
    expect(accounts).toEqual({});
  });
});
