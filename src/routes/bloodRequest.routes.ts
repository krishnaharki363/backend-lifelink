/**
 * @file bloodRequest.routes.ts
 * @description Routes for Blood Request APIs.
 */

import { Router } from 'express';
import { authenticate, authorize } from '@middleware/auth.middleware';
import { validateBody, validateQuery } from '@middleware/validateRequest';
import * as bloodRequestController from '@controllers/bloodRequest.controller';
import { Role } from '@prisma/client';
import {
  createBloodRequestSchema,
  getBloodRequestsQuerySchema,
  updateBloodRequestStatusSchema,
} from '@validators/bloodRequest.validators';

const router = Router();

// All blood request routes require the user to be authenticated
router.use(authenticate);

/**
 * @route   POST /api/v1/blood-requests
 * @desc    Create a new emergency blood request
 * @access  Hospital only
 */
router.post(
  '/',
  authorize(Role.HOSPITAL),
  validateBody(createBloodRequestSchema),
  bloodRequestController.createRequest
);

/**
 * @route   GET /api/v1/blood-requests
 * @desc    Get all active blood requests with pagination/filters
 * @access  All authenticated users (Donors need to see them to donate)
 */
router.get(
  '/',
  validateQuery(getBloodRequestsQuerySchema),
  bloodRequestController.getRequests
);

/**
 * @route   GET /api/v1/blood-requests/:id
 * @desc    Get a specific blood request by ID
 * @access  All authenticated users
 */
router.get('/:id', bloodRequestController.getRequestById);

/**
 * @route   PATCH /api/v1/blood-requests/:id/status
 * @desc    Update the status of a blood request (e.g., FULFILLED)
 * @access  Hospital (for their own requests) or Admin
 */
router.patch(
  '/:id/status',
  authorize(Role.HOSPITAL, Role.ADMIN),
  validateBody(updateBloodRequestStatusSchema),
  bloodRequestController.updateStatus
);

export default router;
