/**
 * @file asyncWrapper.ts
 * @description Higher-order function that wraps async Express route handlers.
 *
 * THE PROBLEM WITHOUT THIS:
 * Express does not catch errors thrown inside async functions.
 * If you write:
 *
 *   router.get('/users', async (req, res) => {
 *     const users = await userService.findAll(); // throws!
 *   });
 *
 * The error is an unhandled promise rejection — it crashes Node.js silently
 * (or triggers an UnhandledPromiseRejectionWarning), bypassing your global
 * error handler entirely.
 *
 * THE NAIVE FIX — DON'T DO THIS:
 *   router.get('/users', async (req, res, next) => {
 *     try {
 *       const users = await userService.findAll();
 *       res.json(users);
 *     } catch (err) {
 *       next(err); // ← every single controller needs this
 *     }
 *   });
 *
 * With 50 endpoints, that's 50 identical try/catch blocks. DRY violation.
 *
 * THE PRODUCTION FIX — THIS FILE:
 * A Higher-Order Function (HOF) that wraps any async handler.
 * It runs the handler, and if it rejects, forwards the error to next().
 *
 * RESULT:
 * Controllers become clean and linear:
 *
 *   router.get('/users', catchAsync(async (req, res) => {
 *     const users = await userService.findAll();
 *     sendSuccess(res, { users });
 *     // No try/catch. Errors automatically reach errorHandler.
 *   }));
 *
 * USAGE:
 *   import { catchAsync } from '@utils/asyncWrapper';
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Type for an async Express route handler.
 * Identical to RequestHandler but the return type is Promise<void>.
 */
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wraps an async Express route handler and forwards any rejection to next().
 *
 * The `.catch(next)` pattern is the idiomatic Express way to propagate
 * errors from async handlers to the global error middleware.
 *
 * @param fn - An async request handler function
 * @returns  A synchronous RequestHandler that Express can safely call
 */
export const catchAsync = (fn: AsyncRequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Execute the async handler.
    // If it rejects, `.catch(next)` passes the error to Express's
    // error handling pipeline (errorHandler middleware).
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
