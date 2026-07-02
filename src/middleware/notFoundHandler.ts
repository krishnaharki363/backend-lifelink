/**
 * @file notFoundHandler.ts
 * @description Middleware that catches requests to undefined routes.
 *
 * WHY A DEDICATED 404 HANDLER?
 * Without it, Express returns a plain HTML page for unknown routes:
 *   <html><body><pre>Cannot GET /api/v1/blah</pre></body></html>
 *
 * That's a problem because:
 * 1. Our API is JSON-only — HTML responses break any client that expects JSON.
 * 2. It leaks information (tells attackers what version of Express is running).
 * 3. It bypasses our centralized error handling pipeline.
 *
 * PLACEMENT:
 * This middleware must be registered AFTER all routes in app.ts.
 * Express matches middleware in the order it's registered.
 * If a request reaches this handler, no route matched it.
 *
 * It creates an AppError and passes it to next() — which routes it
 * to our global errorHandler for consistent formatting.
 *
 * USAGE (in app.ts):
 *   // After all routes:
 *   app.use(notFoundHandler);
 *   app.use(errorHandler);
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@utils/AppError';

/**
 * Catch-all handler for routes that don't match any defined route.
 * Forwards a 404 AppError to the global error handler.
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(
    AppError.notFound(
      `Route not found: ${req.method} ${req.originalUrl}. ` +
        `Please check the API documentation at /api/v1/docs`,
    ),
  );
};
