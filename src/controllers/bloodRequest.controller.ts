/**
 * @file bloodRequest.controller.ts
 * @description Controller for Blood Request API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as bloodRequestService from '@services/bloodRequest.service';
import { HttpStatus } from '@constants/http.constants';
import { prisma } from '@config/database';
import { Role } from '@prisma/client';
import { AppError } from '@utils/AppError';
import type {
  GetBloodRequestsQuery,
  CreateBloodRequestInput,
  UpdateBloodRequestStatusInput,
} from '@validators/bloodRequest.validators';

/**
 * POST /api/v1/blood-requests
 * Creates a new blood request (Hospital only).
 */
export const createRequest = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const result = await bloodRequestService.createBloodRequest(
    user.userId,
    req.body as CreateBloodRequestInput,
  );

  sendSuccess(res, result, 'Blood request created successfully', HttpStatus.CREATED);
});

/**
 * GET /api/v1/blood-requests
 * Retrieves a paginated/filtered list of blood requests.
 */
export const getRequests = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const query = req.query as unknown as GetBloodRequestsQuery;

  if (user.role === Role.HOSPITAL) {
    const hospital = await prisma.hospitalProfile.findUnique({
      where: { userId: user.userId },
    });
    if (hospital) {
      query.hospitalId = hospital.id;
    }
  } else if (user.role === Role.BLOOD_BANK) {
    const bank = await prisma.bloodBankProfile.findUnique({
      where: { userId: user.userId },
    });
    if (bank) {
      query.matchedBloodBankId = bank.id;
    }
  }

  const result = await bloodRequestService.getBloodRequests(query);

  sendSuccess(res, result, 'Blood requests retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/blood-requests/:id
 * Retrieves a single blood request by ID.
 */
export const getRequestById = catchAsync(async (req: Request, res: Response) => {
  const requestId = req.params.id;
  if (!requestId) {
    throw AppError.badRequest('Request ID is required');
  }

  const result = await bloodRequestService.getBloodRequestById(requestId);

  sendSuccess(res, result, 'Blood request retrieved successfully', HttpStatus.OK);
});

/**
 * PATCH /api/v1/blood-requests/:id/status
 * Updates the status of a blood request.
 */
export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const requestId = req.params.id;
  if (!requestId) {
    throw AppError.badRequest('Request ID is required');
  }

  const result = await bloodRequestService.updateBloodRequestStatus(
    requestId,
    user.userId,
    user.role,
    req.body as UpdateBloodRequestStatusInput,
  );

  sendSuccess(res, result, 'Blood request status updated successfully', HttpStatus.OK);
});

/**
 * POST /api/v1/blood-requests/:id/accept
 * Accepts a pending request directly (Donor only).
 */
export const acceptRequest = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const requestId = req.params.id;
  if (!requestId) {
    throw AppError.badRequest('Request ID is required');
  }

  const result = await bloodRequestService.acceptBloodRequest(requestId, user.userId);

  sendSuccess(res, result, 'Blood request accepted successfully', HttpStatus.OK);
});

/**
 * POST /api/v1/blood-requests/:id/confirm-inventory
 * Confirms inventory match (Blood bank only).
 */
export const confirmInventory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const requestId = req.params.id;
  if (!requestId) {
    throw AppError.badRequest('Request ID is required');
  }

  const result = await bloodRequestService.confirmInventoryMatch(requestId, user.userId);

  sendSuccess(res, result, 'Inventory match confirmed successfully', HttpStatus.OK);
});

/**
 * POST /api/v1/blood-requests/:id/claim-inventory
 * Claims an open request using the current blood bank's available stock.
 */
export const claimInventory = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const requestId = req.params.id;
  if (!requestId) {
    throw AppError.badRequest('Request ID is required');
  }

  const result = await bloodRequestService.claimInventoryMatch(requestId, user.userId);
  sendSuccess(res, result, 'Blood request claimed successfully', HttpStatus.OK);
});
