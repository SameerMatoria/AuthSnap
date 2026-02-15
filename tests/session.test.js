import { describe, it, expect } from 'vitest';
import { SessionManager } from '../src/session/session-manager.js';
import { SessionError } from '../src/core/errors.js';

describe('SessionManager', () => {
  const manager = new SessionManager({
    secret: 'test-secret-at-least-32-characters-long!',
    maxAge: 3600,
    cookieName: 'test_session',
    secure: false,
  });

  const mockUser = {
    id: '123',
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    provider: 'google',
    emailVerified: true,
    raw: {},
  };

  describe('createToken + verifyToken', () => {
    it('should create a valid JWT and verify it back', async () => {
      const token = await manager.createToken(mockUser);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts

      const user = await manager.verifyToken(token);
      expect(user.id).toBe('123');
      expect(user.email).toBe('test@example.com');
      expect(user.provider).toBe('google');
    });

    it('should reject a tampered token', async () => {
      const token = await manager.createToken(mockUser);
      const tampered = token.slice(0, -5) + 'xxxxx';

      await expect(manager.verifyToken(tampered)).rejects.toThrow(SessionError);
    });

    it('should reject a completely invalid token', async () => {
      await expect(manager.verifyToken('not-a-jwt')).rejects.toThrow(SessionError);
    });

    it('should reject a token signed with a different secret', async () => {
      const otherManager = new SessionManager({
        secret: 'a-completely-different-secret-key!!',
        maxAge: 3600,
      });
      const token = await otherManager.createToken(mockUser);

      await expect(manager.verifyToken(token)).rejects.toThrow(SessionError);
    });
  });

  describe('buildCookieHeader', () => {
    it('should build a proper Set-Cookie string', () => {
      const header = manager.buildCookieHeader('jwt-token-here');
      expect(header).toContain('test_session=jwt-token-here');
      expect(header).toContain('Max-Age=3600');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Lax');
      expect(header).toContain('Path=/');
      // secure is false for this instance
      expect(header).not.toContain('Secure');
    });

    it('should include Secure flag when configured', () => {
      const secureManager = new SessionManager({
        secret: 'test-secret-at-least-32-characters-long!',
        secure: true,
      });
      const header = secureManager.buildCookieHeader('token');
      expect(header).toContain('Secure');
    });
  });

  describe('buildClearCookieHeader', () => {
    it('should build a cookie-clearing header', () => {
      const header = manager.buildClearCookieHeader();
      expect(header).toContain('test_session=');
      expect(header).toContain('Max-Age=0');
    });
  });

  describe('getTokenFromRequest', () => {
    it('should extract token from parsed cookies', () => {
      const req = { cookies: { test_session: 'my-token' }, headers: {} };
      expect(manager.getTokenFromRequest(req)).toBe('my-token');
    });

    it('should extract token from raw Cookie header', () => {
      const req = {
        headers: { cookie: 'other=value; test_session=my-token; another=val' },
      };
      expect(manager.getTokenFromRequest(req)).toBe('my-token');
    });

    it('should return null if no cookie is present', () => {
      const req = { headers: {} };
      expect(manager.getTokenFromRequest(req)).toBeNull();
    });

    it('should return null if the specific cookie is missing', () => {
      const req = { headers: { cookie: 'other=value' } };
      expect(manager.getTokenFromRequest(req)).toBeNull();
    });
  });
});
