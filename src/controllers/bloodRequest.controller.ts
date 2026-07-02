/**
 * @file bloodRequest.controller.ts
 * @description Controller for Blood Request API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as bloodRequestService from '@services/bloodRequest.service';
import { HttpStatus } from '@constants/http.constants';

/**
 * POST /api/v1/blood-requests
 * Creates a new blood request (Hospital only).
 */
export const createRequest = catchAsync(async (req: Request, res: Response) => {
  // req.user is guaranteed to exist because this route is protected by `authenticate`
  const result = await bloodRequestService.createBloodRequest(req.user!.userId, req.body);

  sendSuccess(res, result, 'Blood request created successfully', HttpStatus.CREATED);
});

/**
 * GET /api/v1/blood-requests
 * Retrieves a paginated/filtered list of blood requests.
 */
export const getRequests = catchAsync(async (req: Request, res: Response) => {
  // req.query is validated and coerced by Zod in the middleware
  const result = await bloodRequestService.getBloodRequests(req.query as any);

  sendSuccess(res, result, 'Blood requests retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/blood-requests/:id
 * Retrieves a single blood request by ID.
 */
export const getRequestById = catchAsync(async (req: Request, res: Response) => {
  const result = await bloodRequestService.getBloodRequestById(req.params.id as string);

  sendSuccess(res, result, 'Blood request retrieved successfully', HttpStatus.OK);
});

/**
 * PATCH /api/v1/blood-requests/:id/status
 * Updates the status of a blood request.
 */
export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const result = await bloodRequestService.updateBloodRequestStatus(
    req.params.id as string,
    req.user!.userId,
    req.user!.role,
    req.body
  );

  sendSuccess(res, result, 'Blood request status updated successfully', HttpStatus.OK);
});
