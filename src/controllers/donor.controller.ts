/**
 * @file donor.controller.ts
 * @description Controller for Donor Search API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as donorService from '@services/donor.service';
import { HttpStatus } from '@constants/http.constants';
import { AppError } from '@utils/AppError';
import type { SearchDonorsQuery, UpdateDonorProfileInput } from '@validators/donor.validators';

/**
 * GET /api/v1/donors/search
 * Searches for donors using universal compatibility matching.
 */
export const searchDonors = catchAsync(async (req: Request, res: Response) => {
  // req.query is validated and coerced by Zod in the middleware
  const query = req.query as unknown as SearchDonorsQuery;
  const result = await donorService.searchCompatibleDonors(query);

  sendSuccess(res, result, 'Compatible donors retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/donors/profile
 * Retrieves the logged-in donor's profile.
 */
export const getProfile = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const result = await donorService.getDonorProfile(user.userId);
  sendSuccess(res, result, 'Donor profile retrieved successfully', HttpStatus.OK);
});

/**
 * PUT /api/v1/donors/profile
 * Updates the logged-in donor's profile.
 */
export const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const result = await donorService.updateDonorProfile(
    user.userId,
    req.body as UpdateDonorProfileInput
  );
  sendSuccess(res, result, 'Donor profile updated successfully', HttpStatus.OK);
});
