/**
 * @file auth.routes.ts
 * @description Route definitions for authentication endpoints.
 *
 * Notice how clean this is:
 * Endpoint -> Rate Limiter -> Zod Validation -> Controller
 */

import { Router } from 'express';
import { validateBody } from '@middleware/validateRequest';
import { registerSchema, loginSchema, refreshTokenSchema } from '@validators/auth.validators';
import * as authController from '@controllers/auth.controller';
import { loginLimiter, registrationLimiter } from '@middleware/rateLimiter';

const router = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Registers a new user and creates their role-specific profile
 * @access  Public
 */
router.post(
  '/register',
  registrationLimiter,
  validateBody(registerSchema),
  authController.register,
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticates a user and issues JWT tokens
 * @access  Public
 */
router.post('/login', loginLimiter, validateBody(loginSchema), authController.login);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Issues a new access token using a valid refresh token
 * @access  Public
 */
router.post('/refresh', loginLimiter, validateBody(refreshTokenSchema), authController.refresh);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Clears the HTTP-only refresh token cookie
 * @access  Public
 */
router.post('/logout', authController.logout);

export default router;
