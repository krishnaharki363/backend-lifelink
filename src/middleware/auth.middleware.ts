/**
 * @file auth.middleware.ts
 * @description Express middleware for protecting routes (authentication & authorization).
 *
 * HOW IT WORKS:
 * 1. `authenticate` checks if a valid JWT access token is present in the Authorization header.
 *    If valid, it extracts the `JwtPayload` (userId, role, email) and attaches it to `req.user`.
 * 2. `authorize` checks if `req.user.role` matches the allowed roles for a specific route.
 *
 * USAGE:
 *   import { authenticate, authorize } from '@middleware/auth.middleware';
 *
 *   // Authenticate only (any logged-in user)
 *   router.get('/profile', authenticate, userController.getProfile);
 *
 *   // Authenticate + Authorize (only ADMIN or HOSPITAL)
 *   router.post('/blood-request', authenticate, authorize('ADMIN', 'HOSPITAL'), ...);
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@config/env';
import { AppError } from '@utils/AppError';
import type { Role } from '@prisma/client';
import type { JwtPayload } from '@services/auth.service';

/**
 * Middleware to ensure the request has a valid JWT access token.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  // 1. Extract token from header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Access token is missing or invalid');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw AppError.unauthorized('Access token is missing');
  }

  try {
    // 2. Verify the token signature and expiration
    // jwt.verify throws if the token is invalid or expired
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    // 3. Attach the user payload to the request object.
    // Thanks to our express.d.ts augmentation, TypeScript knows `req.user` exists.
    req.user = decoded;

    next();
  } catch (error) {
    // 4. Forward JWT errors to the global error handler
    // The errorHandler will convert JsonWebTokenError -> 401 Unauthorized
    // and TokenExpiredError -> 401 Unauthorized (with specific message).
    next(error);
  }
};

/**
 * Middleware factory to ensure the authenticated user has a specific role.
 * MUST be placed after `authenticate` in the middleware chain.
 *
 * @param allowedRoles - Spread of allowed Role enums
 * @returns An Express RequestHandler middleware
 */
export const authorize = (...allowedRoles: Role[]): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Defensive check: this means the route was configured with `authorize`
    // but without `authenticate` preceding it.
    if (!req.user) {
      throw AppError.internal('Authorize middleware requires authenticate middleware to run first');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw AppError.forbidden('You do not have permission to access this resource');
    }

    next();
  };
};
