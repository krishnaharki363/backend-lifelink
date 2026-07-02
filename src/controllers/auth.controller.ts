/**
 * @file auth.controller.ts
 * @description Controller for authentication routes.
 *
 * This layer is responsible for:
 * - Extracting data from the request (req.body, req.cookies)
 * - Calling the appropriate service method
 * - Setting HTTP-only cookies for refresh tokens
 * - Sending the formatted response using our `sendSuccess` utility
 *
 * It contains NO business logic or database queries.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as authService from '@services/auth.service';
import { HttpStatus } from '@constants/http.constants';
import { env } from '@config/env';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Attaches the refresh token to a secure, HTTP-only cookie.
 *
 * WHY HTTP-ONLY COOKIES?
 * If we send the refresh token in the JSON body, the frontend has to store it
 * (usually in localStorage). LocalStorage is accessible to JavaScript, making
 * it vulnerable to XSS (Cross-Site Scripting) attacks.
 *
 * HTTP-only cookies cannot be read by JavaScript. The browser automatically
 * includes them in subsequent requests to the same domain.
 */
const setRefreshTokenCookie = (res: Response, token: string): void => {
  res.cookie('refreshToken', token, {
    httpOnly: true, // Prevent XSS access
    secure: env.NODE_ENV === 'production', // Send only over HTTPS in production
    sameSite: 'strict', // Prevent CSRF attacks
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (should match JWT_REFRESH_EXPIRES_IN)
  });
};

// ─── Controller Methods ───────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 */
export const register = catchAsync(async (req: Request, res: Response): Promise<void> => {
  // 1. req.body is already validated by Zod at this point
  const result = await authService.register(req.body);

  // 2. Set the refresh token securely in a cookie
  setRefreshTokenCookie(res, result.refreshToken);

  // 3. Send the access token and user data in the JSON body
  sendSuccess(
    res,
    {
      accessToken: result.accessToken,
      user: result.user,
    },
    'Registration successful',
    HttpStatus.CREATED,
  );
});

/**
 * POST /api/v1/auth/login
 */
export const login = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const result = await authService.login(req.body);

  setRefreshTokenCookie(res, result.refreshToken);

  sendSuccess(
    res,
    {
      accessToken: result.accessToken,
      user: result.user,
    },
    'Login successful',
    HttpStatus.OK,
  );
});

/**
 * POST /api/v1/auth/refresh
 */
export const refresh = catchAsync(async (req: Request, res: Response): Promise<void> => {
  // The refresh token can come from either the secure cookie OR the request body
  // (We check the cookie first as it's the most secure mechanism)
  const token = (req.cookies.refreshToken as string) || req.body.refreshToken;

  const result = await authService.refreshTokens(token);

  setRefreshTokenCookie(res, result.refreshToken);

  sendSuccess(
    res,
    { accessToken: result.accessToken },
    'Tokens refreshed successfully',
    HttpStatus.OK,
  );
});

/**
 * POST /api/v1/auth/logout
 */
export const logout = catchAsync(async (_req: Request, res: Response): Promise<void> => {
  // Clear the refresh token cookie
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
  });

  sendSuccess(res, null, 'Logged out successfully', HttpStatus.OK);
});
