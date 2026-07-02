/**
 * @file errorHandler.ts
 * @description Global Express error handling middleware.
 *
 * HOW EXPRESS ERROR HANDLING WORKS:
 * Express identifies error-handling middleware by its 4-parameter signature:
 *   (err, req, res, next) — ALL four parameters are required.
 * When any middleware calls `next(err)` or a `catchAsync` handler rejects,
 * Express skips all normal middleware and jumps directly here.
 *
 * THIS IS THE LAST LINE OF DEFENCE.
 * Every unhandled error in the application ends up here.
 * This handler's job:
 *   1. Normalize the error into a known shape (AppError or plain Error)
 *   2. Log the error with appropriate severity
 *   3. Send a consistent JSON response to the client
 *   4. NEVER leak sensitive information (stack traces, SQL, etc.) in production
 *
 * WHY NORMALIZE THIRD-PARTY ERRORS?
 * Libraries throw their own error types:
 * - Prisma throws `PrismaClientKnownRequestError`
 * - JWT throws `JsonWebTokenError` / `TokenExpiredError`
 * - Zod throws `ZodError`
 * The handler converts these into our AppError format so the client
 * always gets the same response shape — regardless of what threw.
 *
 * USAGE (in app.ts):
 *   // Must be the LAST middleware registered:
 *   app.use(errorHandler);
 */

import type { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { JsonWebTokenError, TokenExpiredError, NotBeforeError } from 'jsonwebtoken';
import { AppError, isAppError } from '@utils/AppError';
import { sendError } from '@utils/apiResponse';
import { createContextLogger } from '@config/logger';
import { isProduction } from '@config/env';
import { HttpStatus } from '@constants/http.constants';
import { ErrorCode } from '@interfaces/error.interface';
import type { IValidationError } from '@interfaces/error.interface';

const log = createContextLogger('ErrorHandler');

// ─── Prisma Error Normalizers ──────────────────────────────────────────────────

/**
 * Converts Prisma's known request errors into AppErrors.
 *
 * Prisma error codes reference: https://www.prisma.io/docs/reference/api-reference/error-reference
 * P2002 = Unique constraint violation (e.g., email already exists)
 * P2025 = Record not found (e.g., update/delete on non-existent record)
 * P2003 = Foreign key constraint failure
 */
const handlePrismaKnownError = (err: Prisma.PrismaClientKnownRequestError): AppError => {
  switch (err.code) {
    case 'P2002': {
      // Extract the conflicting field name from Prisma's meta object
      const fields = (err.meta?.target as string[])?.join(', ') ?? 'field';
      return new AppError(
        `A record with this ${fields} already exists`,
        HttpStatus.CONFLICT,
        ErrorCode.ALREADY_EXISTS,
        true,
      );
    }

    case 'P2025':
      return new AppError(
        'The requested record was not found',
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        true,
      );

    case 'P2003':
      return new AppError(
        'Operation failed: related record not found',
        HttpStatus.BAD_REQUEST,
        ErrorCode.INVALID_INPUT,
        true,
      );

    default:
      // Unknown Prisma error — treat as internal (non-operational)
      return new AppError(
        'A database error occurred',
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.DATABASE_ERROR,
        false, // Not operational — log this for investigation
      );
  }
};

/**
 * Handles Prisma validation errors (malformed query parameters).
 */
const handlePrismaValidationError = (_err: Prisma.PrismaClientValidationError): AppError => {
  return new AppError(
    'Invalid data provided to the database query',
    HttpStatus.BAD_REQUEST,
    ErrorCode.VALIDATION_ERROR,
    true,
  );
};

// ─── Zod Error Normalizer ──────────────────────────────────────────────────────

/**
 * Converts Zod validation errors into our structured validation format.
 * Extracts field-level error messages for detailed client feedback.
 */
const handleZodError = (err: ZodError): AppError => {
  const validationErrors: IValidationError[] = err.errors.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));

  return new AppError(
    'Validation failed',
    HttpStatus.UNPROCESSABLE_ENTITY,
    ErrorCode.VALIDATION_ERROR,
    true,
    validationErrors,
  );
};

// ─── JWT Error Normalizers ─────────────────────────────────────────────────────

const handleJWTError = (_err: JsonWebTokenError): AppError =>
  new AppError('Invalid or malformed token', HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_INVALID, true);

const handleJWTExpiredError = (_err: TokenExpiredError): AppError =>
  new AppError('Your session has expired. Please log in again.', HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_EXPIRED, true);

// ─── Error Classifier ─────────────────────────────────────────────────────────

/**
 * Converts any unknown error into an AppError.
 * This is the central routing function that examines the error type
 * and delegates to the appropriate normalizer.
 */
const classifyError = (err: unknown): AppError => {
  // Already an AppError — no conversion needed
  if (isAppError(err)) return err;

  // Prisma known errors (constraint violations, record not found, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaKnownError(err);
  }

  // Prisma validation errors (bad query construction)
  if (err instanceof Prisma.PrismaClientValidationError) {
    return handlePrismaValidationError(err);
  }

  // Zod schema validation errors
  if (err instanceof ZodError) {
    return handleZodError(err);
  }

  // JWT errors — order matters: TokenExpiredError extends JsonWebTokenError
  if (err instanceof TokenExpiredError) {
    return handleJWTExpiredError(err);
  }
  if (err instanceof NotBeforeError) {
    return handleJWTExpiredError(err as unknown as TokenExpiredError);
  }
  if (err instanceof JsonWebTokenError) {
    return handleJWTError(err);
  }

  // Plain JS Error — likely a programmer mistake
  if (err instanceof Error) {
    return new AppError(
      err.message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.INTERNAL_ERROR,
      false, // Unknown native errors are treated as non-operational bugs
    );
  }

  // Something was thrown that isn't an Error (e.g., `throw "string"`)
  // This should never happen in well-written TypeScript code.
  return new AppError(
    'An unexpected error occurred',
    HttpStatus.INTERNAL_SERVER_ERROR,
    ErrorCode.INTERNAL_ERROR,
    false,
  );
};

// ─── Global Error Handler ──────────────────────────────────────────────────────

/**
 * Express global error handling middleware.
 *
 * CRITICAL: Must have EXACTLY 4 parameters.
 * If you remove `_next`, Express will NOT treat this as error middleware.
 * The `_next` parameter is intentionally unused — we never call next()
 * from an error handler (the request ends here).
 */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // Classify the error into a normalized AppError
  const appError = classifyError(err);

  // ── Logging Strategy ──────────────────────────────────────────────────────
  // Operational errors (expected): log at 'warn' — these are normal business events
  // Programmer errors (bugs): log at 'error' — these need immediate attention
  if (appError.isOperational) {
    log.warn(
      {
        err: appError,
        code: appError.code,
        statusCode: appError.statusCode,
        method: req.method,
        url: req.originalUrl,
      },
      appError.message,
    );
  } else {
    // Non-operational = a bug. Log the full error including stack trace.
    log.error(
      {
        err: appError,
        code: appError.code,
        statusCode: appError.statusCode,
        method: req.method,
        url: req.originalUrl,
        body: req.body as unknown,
      },
      `UNHANDLED ERROR: ${appError.message}`,
    );
  }

  // ── Response Strategy ─────────────────────────────────────────────────────
  // SECURITY: Never send stack traces or internal details to the client in production.
  // In development, include the stack trace for faster debugging.
  const stack = isProduction ? undefined : appError.stack;

  sendError(
    res,
    appError.message,
    appError.statusCode,
    appError.code,
    appError.details,
    stack,
  );
};
