/**
 * In-memory server-side session tracker for AuthSnap.
 *
 * Tracks which users have active sessions, enabling session revocation
 * (e.g., "log out all devices"). Use this alongside JWT sessions to add
 * server-side revocation capability.
 *
 * For production, replace the internal Map with Redis or a database.
 *
 * @example
 * import { AuthSnap } from 'authsnap';
 * import { MemorySessionStore } from './stores/memory-session-store.js';
 *
 * const sessions = new MemorySessionStore();
 *
 * const auth = new AuthSnap({
 *   providers: { google: { clientId: '...', clientSecret: '...' } },
 *   session: { secret: process.env.SESSION_SECRET },
 *   callbacks: {
 *     onSuccess(user) {
 *       sessions.create(user.id);
 *       return { redirect: '/dashboard' };
 *     },
 *   },
 * });
 *
 * // In protect middleware or route handler:
 * // if (!sessions.isActive(req.user.id)) return res.status(401).json({ error: 'Session revoked' });
 *
 * // To revoke all sessions for a user:
 * // sessions.revoke(userId);
 */
export class MemorySessionStore {
  constructor() {
    /** @type {Map<string, { createdAt: number }>} */
    this._sessions = new Map();
  }

  /**
   * Create/activate a session for a user.
   * @param {string} userId
   */
  create(userId) {
    this._sessions.set(userId, { createdAt: Date.now() });
  }

  /**
   * Revoke a user's session.
   * @param {string} userId
   * @returns {boolean} Whether a session was revoked
   */
  revoke(userId) {
    return this._sessions.delete(userId);
  }

  /**
   * Check if a user has an active session.
   * @param {string} userId
   * @returns {boolean}
   */
  isActive(userId) {
    return this._sessions.has(userId);
  }

  /**
   * Revoke all sessions.
   */
  clear() {
    this._sessions.clear();
  }

  /**
   * Number of active sessions.
   * @returns {number}
   */
  get size() {
    return this._sessions.size;
  }
}
