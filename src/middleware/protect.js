/**
 * Creates middleware that protects routes — only authenticated users pass through.
 * Supports role-based and permission-based access control.
 *
 * @param {import('../session/session-manager.js').SessionManager} sessionManager
 * @param {Object} [options]
 * @param {string} [options.redirect] - URL to redirect unauthenticated users to
 * @param {string[]} [options.roles] - Required roles (user must have at least one)
 * @param {string[]} [options.permissions] - Required permissions (user must have at least one)
 * @param {string} [options.forbiddenRedirect] - URL to redirect users who lack roles/permissions
 * @returns {Function} Express-compatible middleware
 */
export function createProtectMiddleware(sessionManager, options = {}) {
  return async (req, res, next) => {
    const token = sessionManager.getTokenFromRequest(req);

    if (!token) {
      return handleUnauthorized(res, options);
    }

    try {
      req.user = await sessionManager.verifyToken(token);
    } catch {
      return handleUnauthorized(res, options);
    }

    // RBAC: check roles
    if (options.roles && options.roles.length > 0) {
      const userRoles = req.user.roles || [];
      const hasRole = options.roles.some((r) => userRoles.includes(r));
      if (!hasRole) {
        return handleForbidden(res, options);
      }
    }

    // RBAC: check permissions
    if (options.permissions && options.permissions.length > 0) {
      const userPerms = req.user.permissions || [];
      const hasPerm = options.permissions.some((p) => userPerms.includes(p));
      if (!hasPerm) {
        return handleForbidden(res, options);
      }
    }

    next();
  };
}

/**
 * @param {Object} res
 * @param {Object} options
 */
function handleUnauthorized(res, options) {
  if (options.redirect) {
    return res.redirect(options.redirect);
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * @param {Object} res
 * @param {Object} options
 */
function handleForbidden(res, options) {
  if (options.forbiddenRedirect) {
    return res.redirect(options.forbiddenRedirect);
  }
  return res.status(403).json({ error: 'Forbidden' });
}
