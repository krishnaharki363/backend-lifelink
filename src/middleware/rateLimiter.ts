/**
 * @file rateLimiter.ts
 * @description Rate limiting middleware using express-rate-limit.
 *
 * WHY RATE LIMITING?
 * Without it, a single bad actor (or misconfigured bot) can:
 * - Brute-force login endpoints (try 1000 passwords per second)
 * - Exhaust your Neon database connection pool with thousands of queries
 * - Generate enormous bills on pay-per-request cloud services
 * - Make the API unavailable for legitimate users (DoS)
 *
 * OWASP lists "Unrestricted Resource Consumption" (API4) as a top API
 * security risk — rate limiting is the primary mitigation.
 *
 * WHY MULTIPLE LIMITERS?
 * A single global limiter is too blunt. Sensitive endpoints need stricter
 * limits. We define:
 *
 * 1. globalLimiter    → Applied to ALL routes (generous limit, catches floods)
 * 2. authLimiter      → Applied to /auth/* (strict — prevents brute force)
 * 3. sensitiveApiLimiter → Applied to password reset, email verification etc.
 *
 * IMPORTANT — In-Memory Store Limitation:
 * express-rate-limit uses an in-memory store by default.
 * This means rate limit counts are NOT shared across multiple server instances.
 * If you scale to 3 servers, a user gets 3x the allowed requests.
 *
 * For production with multiple instances, replace the store with:
 * - `rate-limit-redis` (recommended — fast, shared, TTL-based)
 * - `rate-limit-memcached`
 *
 * We leave this as a NOTE for now — we start with single-instance deployment.
 *
 * USAGE:
 *   import { globalLimiter, authLimiter } from '@middleware/rateLimiter';
 *   app.use('/api/v1', globalLimiter);
 *   app.use('/api/v1/auth', authLimiter);
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env, isDevelopment, isTest } from '@config/env';
import { HttpStatus, HttpMessage } from '@constants/http.constants';
import { ErrorCode } from '@interfaces/error.interface';
import type { ApiErrorResponse } from '@utils/apiResponse';

// ─── Shared Error Response Factory ───────────────────────────────────────────

/**
 * Builds the standard rate-limit error response body.
 * Matches our ApiErrorResponse envelope so the client gets a consistent shape.
 */
const buildRateLimitResponse = (message: string): ApiErrorResponse => ({
  success: false,
  message,
  code: ErrorCode.TOO_MANY_REQUESTS,
  timestamp: new Date().toISOString(),
});

// ─── Global Rate Limiter ──────────────────────────────────────────────────────

/**
 * Applied to all API routes.
 * Generous limit — designed to stop floods, not normal usage patterns.
 * Values are configurable via environment variables.
 */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, // Default: 15 minutes
  max: env.RATE_LIMIT_MAX_REQUESTS, // Default: 100 requests per window
  standardHeaders: 'draft-7', // Return rate limit info in RateLimit-* headers (RFC draft)
  legacyHeaders: false, // Disable deprecated X-RateLimit-* headers

  // Skip rate limiting in test environment or for health check requests
  skip: (req) =>
    isDevelopment || isTest || req.originalUrl.endsWith('/health') || req.path.endsWith('/health'),

  handler: (req, res) => {
    const resetTime = (
      req as Request & { rateLimit?: { resetTime?: Date } }
    ).rateLimit?.resetTime?.getTime();
    if (resetTime) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)));
    }
    res
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .json(buildRateLimitResponse(HttpMessage.TOO_MANY_REQUESTS));
  },
});

// ─── Auth Rate Limiter ────────────────────────────────────────────────────────

/**
 * Applied exclusively to authentication endpoints (/auth/login, /auth/register).
 * Much stricter than the global limiter — brute-force protection.
 *
 * 10 attempts per 15 minutes is the industry-standard balance between
 * security and usability. A human won't hit this; a brute-forcer will.
 */
const authSkip = () => isDevelopment || isTest;

const authHandler = (message: string) => (req: Request, res: Response) => {
  const resetTime = (
    req as Request & { rateLimit?: { resetTime?: Date } }
  ).rateLimit?.resetTime?.getTime();
  if (resetTime) {
    res.setHeader('Retry-After', Math.max(1, Math.ceil((resetTime - Date.now()) / 1000)));
  }
  res.status(HttpStatus.TOO_MANY_REQUESTS).json(buildRateLimitResponse(message));
};

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes — fixed, not configurable
  max: 10, // 10 login attempts per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: authSkip,
  handler: authHandler('Too many sign-in attempts. Please try again after the retry period.'),
});

export const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: authSkip,
  handler: authHandler('Too many registration attempts. Please try again after the retry period.'),
});

// Backwards-compatible name for imports outside the auth route module.
export const authLimiter = loginLimiter;

// ─── Sensitive API Rate Limiter ───────────────────────────────────────────────

/**
 * Applied to sensitive actions: password reset requests, email verification resends.
 * Very strict — these endpoints are high-value targets for abuse.
 *
 * Prevents attackers from flooding a victim's inbox with reset emails
 * or using password reset as an oracle to enumerate valid emails.
 */
export const sensitiveApiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // 5 requests per hour
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: authSkip,

  handler: (_req, res) => {
    res
      .status(HttpStatus.TOO_MANY_REQUESTS)
      .json(
        buildRateLimitResponse('Too many requests for this action. Please try again in an hour.'),
      );
  },
});
