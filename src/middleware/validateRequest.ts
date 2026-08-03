/**
 * @file validateRequest.ts
 * @description Express middleware to validate request bodies/params/queries using Zod.
 *
 * WHY USE MIDDLEWARE FOR VALIDATION?
 * Validating inputs inside the controller clutters business logic.
 * By pushing validation to the middleware layer:
 * 1. Controllers can safely assume `req.body` is fully typed and valid.
 * 2. Invalid requests are rejected early (422 Unprocessable Entity) before
 *    hitting any business logic or database queries.
 *
 * USAGE:
 *   import { validate } from '@middleware/validateRequest';
 *   import { registerSchema } from '@validators/auth.validators';
 *
 *   router.post('/register', validate(registerSchema), authController.register);
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { catchAsync } from '@utils/asyncWrapper';

/**
 * A generic type representing any valid Zod schema that can be used for validation.
 * It allows both standard objects and objects with `.refine()` or `.superRefine()` (ZodEffects).
 */
export type ZodSchemaType = ZodTypeAny;

/**
 * Middleware that validates the request body against a provided Zod schema.
 * Note: We wrap it in catchAsync to ensure any unexpected errors are routed
 * to the global error handler. (Zod validations are technically synchronous,
 * but this is a good defensive practice).
 *
 * @param schema The Zod schema to validate req.body against
 */
export const validateBody = (schema: ZodSchemaType): RequestHandler =>
  catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.body = (await schema.parseAsync(req.body)) as Record<string, unknown>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
      } else {
        next(error);
      }
    }
  });

/**
 * Middleware that validates the request query parameters against a provided Zod schema.
 */
export const validateQuery = (schema: ZodSchemaType): RequestHandler =>
  catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      req.query = (await schema.parseAsync(req.query)) as Record<string, string | string[] | undefined>;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(error);
      } else {
        next(error);
      }
    }
  });
