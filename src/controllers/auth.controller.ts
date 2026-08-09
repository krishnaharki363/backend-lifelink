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
import type { RegisterRequest, LoginRequest } from '@validators/auth.validators';
import { AppError } from '@utils/AppError';

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
const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  // The frontend and API are commonly deployed on different sites. In
  // production the refresh cookie must be sent cross-site; Secure is required
  // by browsers when SameSite=None is used. Local development stays strict.
  sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('strict' as const),
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const clearRefreshTokenCookieOptions = {
  httpOnly: refreshTokenCookieOptions.httpOnly,
  secure: refreshTokenCookieOptions.secure,
  sameSite: refreshTokenCookieOptions.sameSite,
};

const setRefreshTokenCookie = (res: Response, token: string): void => {
  res.cookie('refreshToken', token, refreshTokenCookieOptions);
};

// ─── Controller Methods ───────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 */
export const register = catchAsync(async (req: Request, res: Response): Promise<void> => {
  // 1. req.body is already validated by Zod at this point
  const result = await authService.register(req.body as RegisterRequest);

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
  const result = await authService.login(req.body as LoginRequest);

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
  const token =
    (req.cookies.refreshToken as string | undefined) ??
    ((req.body as Record<string, unknown>).refreshToken as string | undefined);

  if (!token) {
    throw AppError.unauthorized('Refresh token is required');
  }

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
  await Promise.resolve();
  // Clear the refresh token cookie
  res.clearCookie('refreshToken', clearRefreshTokenCookieOptions);

  sendSuccess(res, null, 'Logged out successfully', HttpStatus.OK);
});
