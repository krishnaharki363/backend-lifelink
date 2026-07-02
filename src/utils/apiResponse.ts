/**
 * @file apiResponse.ts
 * @description Centralized API response formatting utilities.
 *
 * WHY A STANDARD RESPONSE ENVELOPE?
 * Without a standard format, different endpoints return different shapes:
 *   GET /users   → { users: [...] }
 *   POST /login  → { token: "...", user: { ... } }
 *   GET /health  → { status: "ok" }
 *
 * This makes the frontend's job a nightmare — every endpoint needs
 * custom parsing logic. Production APIs use a consistent envelope:
 *
 *   // Success
 *   {
 *     "success": true,
 *     "message": "Request successful",
 *     "data": { ... },
 *     "meta": { "page": 1, "total": 100 }   ← optional, for pagination
 *   }
 *
 *   // Error
 *   {
 *     "success": false,
 *     "message": "User not found",
 *     "code": "NOT_FOUND",
 *     "errors": [...]   ← optional validation errors
 *   }
 *
 * Every controller uses these helpers. The format never varies.
 *
 * USAGE:
 *   import { sendSuccess, sendError } from '@utils/apiResponse';
 *
 *   // In a controller:
 *   sendSuccess(res, { user }, 'User retrieved', HttpStatus.OK);
 *   sendError(res, 'Not found', HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
 */

import type { Response } from 'express';
import type { HttpStatusCode } from '@constants/http.constants';
import { HttpStatus, HttpMessage } from '@constants/http.constants';
import type { ErrorCode } from '@interfaces/error.interface';

// ─── Response Interfaces ──────────────────────────────────────────────────────

/**
 * Pagination metadata for list endpoints.
 * Included in `meta` when the response is a paginated collection.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Shape of a successful API response.
 * The `data` generic ensures type safety propagates from service → controller → response.
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T;
  meta?: PaginationMeta;
  timestamp: string;
}

/**
 * Shape of an error API response.
 * Never includes raw stack traces in production.
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  code: ErrorCode | string;
  errors?: unknown;
  timestamp: string;
  stack?: string; // Only present in development
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Sends a successful JSON response with a consistent envelope.
 *
 * @param res     - Express Response object
 * @param data    - The payload to send (any serializable value)
 * @param message - Human-readable success message
 * @param statusCode - HTTP status code (defaults to 200)
 * @param meta    - Optional pagination metadata
 *
 * @example
 *   sendSuccess(res, { donors }, 'Donors retrieved successfully');
 *   sendSuccess(res, { user }, 'User created', HttpStatus.CREATED);
 */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  message: string = HttpMessage.OK,
  statusCode: HttpStatusCode = HttpStatus.OK,
  meta?: PaginationMeta,
): void => {
  const response: ApiSuccessResponse<T> = {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
    ...(meta !== undefined && { meta }),
  };

  res.status(statusCode).json(response);
};

/**
 * Sends an error JSON response with a consistent envelope.
 *
 * @param res       - Express Response object
 * @param message   - Human-readable error message
 * @param statusCode - HTTP status code
 * @param code      - Machine-readable error code
 * @param errors    - Optional structured validation errors
 * @param stack     - Optional stack trace (development only)
 *
 * @example
 *   sendError(res, 'User not found', HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
 */
export const sendError = (
  res: Response,
  message: string,
  statusCode: HttpStatusCode,
  code: ErrorCode | string,
  errors?: unknown,
  stack?: string,
): void => {
  const response: ApiErrorResponse = {
    success: false,
    message,
    code,
    timestamp: new Date().toISOString(),
    ...(errors !== undefined && { errors }),
    ...(stack !== undefined && { stack }),
  };

  res.status(statusCode).json(response);
};

/**
 * Builds a PaginationMeta object from common pagination parameters.
 * Use this in service/repository methods that return paginated data.
 *
 * @example
 *   const meta = buildPaginationMeta(page, limit, totalCount);
 *   sendSuccess(res, { users }, 'Users retrieved', HttpStatus.OK, meta);
 */
export const buildPaginationMeta = (
  page: number,
  limit: number,
  total: number,
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};
