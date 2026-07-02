/**
 * @file error.interface.ts
 * @description TypeScript interfaces and enums defining the error contract.
 *
 * WHY DEFINE ERROR INTERFACES?
 * JavaScript's built-in Error class is too generic. In production backends,
 * you need to distinguish between:
 *
 * 1. OPERATIONAL errors — expected, business-rule failures:
 *    "User not found", "Invalid password", "Email already taken"
 *    → These should return structured 4xx responses to the client.
 *
 * 2. PROGRAMMER errors — unexpected bugs in the code:
 *    "Cannot read property of undefined", "ECONNREFUSED"
 *    → These should crash the process (or be caught globally) and return
 *      a generic 500 response. NEVER leak stack traces to clients.
 *
 * This interface gives our AppError class (and error handler) a clear,
 * typed contract to work against.
 */

import type { HttpStatusCode } from '@constants/http.constants';

// ─── Error Codes ──────────────────────────────────────────────────────────────

/**
 * Application-level error codes.
 *
 * These are machine-readable identifiers that the client can use to
 * programmatically handle specific errors — far more useful than
 * parsing human-readable messages.
 *
 * Convention: SCREAMING_SNAKE_CASE, grouped by domain.
 *
 * @example
 *   // Client-side:
 *   if (error.code === 'INVALID_CREDENTIALS') {
 *     showLoginError();
 *   }
 */
export enum ErrorCode {
  // ── Validation ────────────────────────────────────────────────────────
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // ── Authentication ────────────────────────────────────────────────────
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  TOKEN_MISSING = 'TOKEN_MISSING',

  // ── Authorization ─────────────────────────────────────────────────────
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // ── Resource ──────────────────────────────────────────────────────────
  NOT_FOUND = 'NOT_FOUND',
  ALREADY_EXISTS = 'ALREADY_EXISTS',
  CONFLICT = 'CONFLICT',

  // ── Rate Limiting ─────────────────────────────────────────────────────
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',

  // ── Server ────────────────────────────────────────────────────────────
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * The contract that every application error must satisfy.
 * Our AppError class implements this interface.
 */
export interface IAppError {
  /** Human-readable message (may be shown to the user) */
  message: string;

  /** HTTP status code to send in the response */
  statusCode: HttpStatusCode;

  /** Machine-readable error code for client-side handling */
  code: ErrorCode;

  /**
   * Operational flag — the critical distinction:
   * - true:  Expected error (bad input, not found, etc.) — handle gracefully
   * - false: Programmer error (bug) — log and return generic 500
   */
  isOperational: boolean;

  /** Optional structured details (e.g., Zod validation field errors) */
  details?: unknown;

  /** Stack trace — included in development responses, never in production */
  stack?: string;
}

/**
 * Shape of a Zod validation issue, used to format field-level errors.
 */
export interface IValidationError {
  field: string;
  message: string;
}
