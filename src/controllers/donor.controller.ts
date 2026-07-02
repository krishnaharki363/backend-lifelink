/**
 * @file donor.controller.ts
 * @description Controller for Donor Search API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as donorService from '@services/donor.service';
import { HttpStatus } from '@constants/http.constants';

/**
 * GET /api/v1/donors/search
 * Searches for donors using universal compatibility matching.
 */
export const searchDonors = catchAsync(async (req: Request, res: Response) => {
  // req.query is validated and coerced by Zod in the middleware
  const result = await donorService.searchCompatibleDonors(req.query as any);

  sendSuccess(res, result, 'Compatible donors retrieved successfully', HttpStatus.OK);
});
