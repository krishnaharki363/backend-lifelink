/**
 * @file AppError.ts
 * @description Custom application error class.
 *
 * WHY EXTEND Error?
 * `throw new Error("something went wrong")` loses structured information —
 * you can only convey a string. Our AppError carries:
 * - HTTP status code (so the error handler knows what to respond with)
 * - Error code (machine-readable, for client-side logic)
 * - isOperational flag (tells the error handler if this is a bug or expected)
 * - Optional structured details (Zod validation errors, etc.)
 *
 * WHY A CUSTOM CLASS INSTEAD OF A PLAIN OBJECT?
 * - `instanceof AppError` checks work reliably in catch blocks.
 * - The prototype chain is preserved — stack traces point to the throw site.
 * - Static factory methods give you a clean, domain-specific API:
 *     throw AppError.notFound('User not found');
 *   instead of:
 *     throw new AppError('User not found', 404, ErrorCode.NOT_FOUND, true);
 *
 * USAGE:
 *   import { AppError } from '@utils/AppError';
 *
 *   // In a service:
 *   const user = await userRepo.findById(id);
 *   if (!user) throw AppError.notFound(`User ${id} does not exist`);
 *
 *   // The error bubbles up through:
 *   // controller → asyncWrapper → Express error pipeline → errorHandler
 */

import type { IAppError, IValidationError } from '@interfaces/error.interface';
import { ErrorCode } from '@interfaces/error.interface';
import { HttpStatus, type HttpStatusCode } from '@constants/http.constants';

// ─── AppError Class ───────────────────────────────────────────────────────────

export class AppError extends Error implements IAppError {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: HttpStatusCode,
    code: ErrorCode,
    isOperational = true,
    details?: unknown,
  ) {
    // Call the parent Error constructor — sets this.message and this.stack
    super(message);

    // Restore the prototype chain.
    // Required when extending built-in classes (Error, Array, etc.) in TypeScript
    // when targeting ES5. Without this, `instanceof AppError` returns false.
    Object.setPrototypeOf(this, new.target.prototype);

    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;

    // Capture a clean stack trace pointing to the throw site, not this constructor
    Error.captureStackTrace(this, this.constructor);
  }

  // ─── Static Factory Methods ─────────────────────────────────────────────────
  // These are convenience constructors for the most common error types.
  // They enforce consistency: NotFound is always 404, Unauthorized always 401, etc.

  /**
   * 400 Bad Request — malformed input that doesn't pass basic validation
   * @example throw AppError.badRequest('Invalid blood type provided');
   */
  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, HttpStatus.BAD_REQUEST, ErrorCode.INVALID_INPUT, true, details);
  }

  /**
   * 401 Unauthorized — request requires authentication
   * @example throw AppError.unauthorized('Please log in to continue');
   */
  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, true);
  }

  /**
   * 403 Forbidden — authenticated but lacks permission
   * @example throw AppError.forbidden('Only admins can access this resource');
   */
  static forbidden(message = 'Access denied'): AppError {
    return new AppError(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, true);
  }

  /**
   * 404 Not Found — resource does not exist
   * @example throw AppError.notFound('Donor with this ID was not found');
   */
  static notFound(message: string): AppError {
    return new AppError(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, true);
  }

  /**
   * 409 Conflict — duplicate resource
   * @example throw AppError.conflict('A user with this email already exists');
   */
  static conflict(message: string): AppError {
    return new AppError(message, HttpStatus.CONFLICT, ErrorCode.ALREADY_EXISTS, true);
  }

  /**
   * 422 Unprocessable Entity — Zod schema validation failure
   * Accepts an array of field-level errors for detailed client feedback.
   * @example throw AppError.validationError(zodErrors);
   */
  static validationError(errors: IValidationError[]): AppError {
    return new AppError(
      'Validation failed',
      HttpStatus.UNPROCESSABLE_ENTITY,
      ErrorCode.VALIDATION_ERROR,
      true,
      errors,
    );
  }

  /**
   * 500 Internal Server Error — unexpected programmer error.
   * isOperational = false tells the error handler this is a BUG,
   * not an expected business-rule violation.
   * @example throw AppError.internal('Unexpected state in payment processor');
   */
  static internal(message = 'An unexpected error occurred'): AppError {
    return new AppError(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      false, // NOT operational — this is a bug
    );
  }
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

/**
 * Type guard to check if an unknown thrown value is an AppError.
 *
 * WHY NOT JUST `error instanceof AppError`?
 * In some edge cases (e.g., module boundaries, Webpack bundling),
 * instanceof checks can fail. This guard is more defensive.
 *
 * @example
 *   catch (error) {
 *     if (isAppError(error)) {
 *       // TypeScript knows: error.statusCode, error.code, etc.
 *     }
 *   }
 */
export const isAppError = (error: unknown): error is AppError => {
  return error instanceof AppError;
};

/**
 * Determines if an error is an operational (expected) error.
 * Used by the global error handler to decide how to respond.
 */
export const isOperationalError = (error: unknown): boolean => {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
};
