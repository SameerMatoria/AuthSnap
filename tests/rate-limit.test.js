import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from '../src/middleware/rate-limit.js';

describe('createRateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  });

  it('should allow requests under the limit', () => {
    expect(limiter.check('127.0.0.1')).toBe(true);
    expect(limiter.check('127.0.0.1')).toBe(true);
    expect(limiter.check('127.0.0.1')).toBe(true);
  });

  it('should block requests over the limit', () => {
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    limiter.check('127.0.0.1');
    expect(limiter.check('127.0.0.1')).toBe(false);
  });

  it('should track keys independently', () => {
    limiter.check('1.1.1.1');
    limiter.check('1.1.1.1');
    limiter.check('1.1.1.1');
    // 1.1.1.1 is now at limit
    expect(limiter.check('1.1.1.1')).toBe(false);
    // 2.2.2.2 has not been seen yet
    expect(limiter.check('2.2.2.2')).toBe(true);
  });

  it('should allow requests after the window expires', async () => {
    const fastLimiter = createRateLimiter({ windowMs: 50, max: 1 });
    fastLimiter.check('ip');
    expect(fastLimiter.check('ip')).toBe(false);

    await new Promise((r) => setTimeout(r, 60));
    expect(fastLimiter.check('ip')).toBe(true);
  });

  it('should reset a specific key', () => {
    limiter.check('ip');
    limiter.check('ip');
    limiter.check('ip');
    expect(limiter.check('ip')).toBe(false);

    limiter.reset('ip');
    expect(limiter.check('ip')).toBe(true);
  });

  it('should clear all rate limit data', () => {
    limiter.check('a');
    limiter.check('a');
    limiter.check('a');
    limiter.check('b');
    limiter.check('b');
    limiter.check('b');

    limiter.clear();
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('b')).toBe(true);
  });

  it('should use default options when none provided', () => {
    const defaultLimiter = createRateLimiter();
    // Default max is 10 — should allow 10 requests
    for (let i = 0; i < 10; i++) {
      expect(defaultLimiter.check('ip')).toBe(true);
    }
    expect(defaultLimiter.check('ip')).toBe(false);
  });
});
