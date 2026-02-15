import { describe, it, expect, vi } from 'vitest';
import { createProtectMiddleware } from '../src/middleware/protect.js';
import { SessionManager } from '../src/session/session-manager.js';

describe('protect middleware', () => {
  const sessionManager = new SessionManager({
    secret: 'test-secret-at-least-32-characters-long!',
    maxAge: 3600,
    cookieName: 'authsnap_session',
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

  it('should call next() and attach user for valid session', async () => {
    const token = await sessionManager.createToken(mockUser);
    const req = { headers: { cookie: `authsnap_session=${token}` } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const middleware = createProtectMiddleware(sessionManager);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user.id).toBe('123');
    expect(req.user.email).toBe('test@example.com');
  });

  it('should return 401 if no session cookie', async () => {
    const req = { headers: {} };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const middleware = createProtectMiddleware(sessionManager);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
  });

  it('should return 401 for invalid token', async () => {
    const req = { headers: { cookie: 'authsnap_session=bad-token' } };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    const middleware = createProtectMiddleware(sessionManager);
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should redirect when redirect option is set', async () => {
    const req = { headers: {} };
    const res = { redirect: vi.fn() };
    const next = vi.fn();

    const middleware = createProtectMiddleware(sessionManager, { redirect: '/login' });
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/login');
  });
});
