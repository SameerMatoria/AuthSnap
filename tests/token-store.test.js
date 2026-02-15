import { describe, it, expect, beforeEach } from 'vitest';
import { TokenStore } from '../src/session/token-store.js';

describe('TokenStore', () => {
  let store;

  const mockTokens = {
    accessToken: 'access-123',
    refreshToken: 'refresh-456',
    expiresAt: Date.now() + 3600_000,
    tokenType: 'Bearer',
    scope: 'email profile',
  };

  beforeEach(() => {
    store = new TokenStore();
  });

  describe('key()', () => {
    it('should build a key from provider and userId', () => {
      expect(TokenStore.key('google', '123')).toBe('google:123');
      expect(TokenStore.key('github', 'abc')).toBe('github:abc');
    });
  });

  describe('set() and get()', () => {
    it('should store and retrieve tokens', async () => {
      const key = TokenStore.key('google', '123');
      await store.set(key, mockTokens);

      const result = await store.get(key);
      expect(result.accessToken).toBe('access-123');
      expect(result.refreshToken).toBe('refresh-456');
      expect(result.storedAt).toBeDefined();
    });

    it('should return null for missing keys', async () => {
      const result = await store.get('nonexistent:key');
      expect(result).toBeNull();
    });
  });

  describe('has()', () => {
    it('should return true for existing keys', async () => {
      await store.set('google:123', mockTokens);
      expect(await store.has('google:123')).toBe(true);
    });

    it('should return false for missing keys', async () => {
      expect(await store.has('google:999')).toBe(false);
    });
  });

  describe('delete()', () => {
    it('should remove a stored token set', async () => {
      await store.set('google:123', mockTokens);
      expect(await store.has('google:123')).toBe(true);

      await store.delete('google:123');
      expect(await store.has('google:123')).toBe(false);
      expect(await store.get('google:123')).toBeNull();
    });
  });

  describe('isExpired()', () => {
    it('should return false for non-expired tokens', async () => {
      await store.set('google:123', mockTokens);
      expect(await store.isExpired('google:123')).toBe(false);
    });

    it('should return true for expired tokens', async () => {
      await store.set('google:123', {
        ...mockTokens,
        expiresAt: Date.now() - 1000,
      });
      expect(await store.isExpired('google:123')).toBe(true);
    });

    it('should return true for missing keys', async () => {
      expect(await store.isExpired('nonexistent')).toBe(true);
    });

    it('should return false if no expiresAt (no expiry info)', async () => {
      await store.set('github:123', {
        accessToken: 'abc',
        expiresAt: null,
      });
      expect(await store.isExpired('github:123')).toBe(false);
    });
  });

  describe('size', () => {
    it('should track stored count', async () => {
      expect(store.size).toBe(0);
      await store.set('google:1', mockTokens);
      expect(store.size).toBe(1);
      await store.set('github:2', mockTokens);
      expect(store.size).toBe(2);
    });
  });

  describe('clear()', () => {
    it('should remove all tokens', async () => {
      await store.set('google:1', mockTokens);
      await store.set('github:2', mockTokens);
      expect(store.size).toBe(2);

      await store.clear();
      expect(store.size).toBe(0);
    });
  });
});
