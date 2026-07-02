/**
 * @file http.constants.ts
 * @description HTTP status codes and standard messages.
 *
 * WHY NOT USE A THIRD-PARTY LIBRARY?
 * Libraries like `http-status` add a dependency for something trivially
 * expressible as a TypeScript enum. Owning this file means:
 * - Zero dependency surface area for this concern.
 * - Full control over naming conventions.
 * - The `as const` pattern gives us literal types, not just `number`.
 *
 * USAGE:
 *   import { HttpStatus, HttpMessage } from '@constants/http.constants';
 *   res.status(HttpStatus.OK).json({ ... });
 */

// ─── Status Codes ────────────────────────────────────────────────────────────

/**
 * Standard HTTP status codes used across the application.
 * Using `as const` gives us literal number types (200 not number),
 * enabling exhaustive checks in switch statements.
 */
export const HttpStatus = {
  // 2xx — Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 3xx — Redirection
  MOVED_PERMANENTLY: 301,
  NOT_MODIFIED: 304,

  // 4xx — Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx — Server Errors
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// Derive a union type of all valid status codes: 200 | 201 | 400 | ...
export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

// ─── Standard Messages ────────────────────────────────────────────────────────

/**
 * Consistent human-readable messages for common responses.
 * Centralizing these prevents typos like "Sucessfully" spreading
 * across dozens of controller files.
 */
export const HttpMessage = {
  OK: 'Request successful',
  CREATED: 'Resource created successfully',
  DELETED: 'Resource deleted successfully',
  UPDATED: 'Resource updated successfully',

  BAD_REQUEST: 'Bad request. Please check your input.',
  UNAUTHORIZED: 'Authentication required. Please log in.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  CONFLICT: 'A resource with this information already exists.',
  UNPROCESSABLE_ENTITY: 'Validation failed. Please check your input.',
  TOO_MANY_REQUESTS: 'Too many requests. Please slow down.',

  INTERNAL_SERVER_ERROR: 'An unexpected error occurred. Please try again later.',
  SERVICE_UNAVAILABLE: 'Service is temporarily unavailable. Please try again later.',
} as const;

export type HttpMessageValue = (typeof HttpMessage)[keyof typeof HttpMessage];
