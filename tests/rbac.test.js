import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from '../src/session/session-manager.js';
import { createProtectMiddleware } from '../src/middleware/protect.js';

const SECRET = 'test-secret-at-least-32-characters-long!';

function makeReq(cookie) {
  return { headers: { cookie }, user: null, cookies: {} };
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    redirectUrl: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
    redirect(url) {
      res.redirectUrl = url;
    },
  };
  return res;
}

describe('RBAC', () => {
  const sm = new SessionManager({ secret: SECRET });

  it('should store roles in JWT and recover them on verify', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { roles: ['admin', 'editor'] });
    const decoded = await sm.verifyToken(jwt);
    expect(decoded.roles).toEqual(['admin', 'editor']);
  });

  it('should store permissions in JWT and recover them on verify', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { permissions: ['read:users', 'write:posts'] });
    const decoded = await sm.verifyToken(jwt);
    expect(decoded.permissions).toEqual(['read:users', 'write:posts']);
  });

  it('should be backward-compatible — no roles/permissions when not provided', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user);
    const decoded = await sm.verifyToken(jwt);
    expect(decoded.roles).toBeUndefined();
    expect(decoded.permissions).toBeUndefined();
  });

  it('should allow access when user has matching role', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { roles: ['admin'] });

    const middleware = createProtectMiddleware(sm, { roles: ['admin'] });
    const req = makeReq(`authsnap_session=${jwt}`);
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user.roles).toEqual(['admin']);
  });

  it('should return 403 when user lacks required role', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { roles: ['viewer'] });

    const middleware = createProtectMiddleware(sm, { roles: ['admin'] });
    const req = makeReq(`authsnap_session=${jwt}`);
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });

  it('should return 401 (not 403) when no token at all', async () => {
    const middleware = createProtectMiddleware(sm, { roles: ['admin'] });
    const req = makeReq('');
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('should allow access when user has matching permission', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { permissions: ['write:posts'] });

    const middleware = createProtectMiddleware(sm, { permissions: ['write:posts'] });
    const req = makeReq(`authsnap_session=${jwt}`);
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('should return 403 when user lacks required permission', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { permissions: ['read:users'] });

    const middleware = createProtectMiddleware(sm, { permissions: ['delete:users'] });
    const req = makeReq(`authsnap_session=${jwt}`);
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('should use forbiddenRedirect when role check fails', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { roles: ['viewer'] });

    const middleware = createProtectMiddleware(sm, {
      roles: ['admin'],
      forbiddenRedirect: '/no-access',
    });
    const req = makeReq(`authsnap_session=${jwt}`);
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.redirectUrl).toBe('/no-access');
  });

  it('should allow when user has at least one of the required roles', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user, { roles: ['editor'] });

    const middleware = createProtectMiddleware(sm, { roles: ['admin', 'editor'] });
    const req = makeReq(`authsnap_session=${jwt}`);
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('should pass without RBAC options (backward-compatible protect)', async () => {
    const user = { id: '1', email: 'a@b.com', name: 'A', avatar: null, provider: 'google', emailVerified: true, raw: {} };
    const jwt = await sm.createToken(user);

    const middleware = createProtectMiddleware(sm);
    const req = makeReq(`authsnap_session=${jwt}`);
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
