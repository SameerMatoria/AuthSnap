/**
 * Base error class for all AuthSnap errors.
 */
export class AuthSnapError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} [statusCode=500]
   */
  constructor(message, code, statusCode = 500) {
    super(message);
    this.name = 'AuthSnapError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ConfigError extends AuthSnapError {
  /** @param {string} message */
  constructor(message) {
    super(message, 'CONFIG_ERROR', 500);
    this.name = 'ConfigError';
  }
}

export class ProviderError extends AuthSnapError {
  /**
   * @param {string} message
   * @param {string} provider
   */
  constructor(message, provider) {
    super(message, 'PROVIDER_ERROR', 502);
    this.name = 'ProviderError';
    this.provider = provider;
  }
}

export class TokenError extends AuthSnapError {
  /** @param {string} message */
  constructor(message) {
    super(message, 'TOKEN_ERROR', 401);
    this.name = 'TokenError';
  }
}

export class SessionError extends AuthSnapError {
  /** @param {string} message */
  constructor(message) {
    super(message, 'SESSION_ERROR', 401);
    this.name = 'SessionError';
  }
}
