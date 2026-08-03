/**
 * @file bloodBank.controller.ts
 * @description Controller for Blood Bank API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as bloodBankService from '@services/bloodBank.service';
import { HttpStatus } from '@constants/http.constants';

/**
 * GET /api/v1/blood-banks
 * Returns a list of all registered blood bank profiles.
 */
export const listBloodBanks = catchAsync(async (_req: Request, res: Response) => {
  const result = await bloodBankService.getAllBloodBanks();
  sendSuccess(res, result, 'Blood banks retrieved successfully', HttpStatus.OK);
});
