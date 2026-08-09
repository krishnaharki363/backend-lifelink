/**
 * @file admin.routes.ts
 * @description Routes for Admin Analytics APIs.
 */

import { Router } from 'express';
import {
  getSystemMetrics,
  getRecentActivity,
  getInventoryByBloodType,
  listDonors,
  listHospitals,
  listRequests,
  listPendingOrganizations,
  updateOrganizationVerification,
} from '@controllers/admin.controller';
import { authenticate, authorize } from '@middleware/auth.middleware';
import { Role } from '@prisma/client';
import { validateBody } from '@middleware/validateRequest';
import { updateVerificationStatusSchema } from '@validators/admin.validators';

const router = Router();

// Apply auth and admin role check to ALL routes in this file
router.use(authenticate, authorize(Role.ADMIN));

/**
 * @route   GET /api/v1/admin/metrics
 * @desc    Get system-wide metrics (users, requests, inventory)
 * @access  Private (ADMIN)
 */
router.get('/metrics', getSystemMetrics);

/**
 * @route   GET /api/v1/admin/activity
 * @desc    Get recent platform activity feed
 * @access  Private (ADMIN)
 */
router.get('/activity', getRecentActivity);

/**
 * @route   GET /api/v1/admin/inventory
 * @desc    Get aggregated inventory by blood type
 * @access  Private (ADMIN)
 */
router.get('/inventory', getInventoryByBloodType);

/**
 * @route   GET /api/v1/admin/donors
 * @desc    Get all donors list
 * @access  Private (ADMIN)
 */
router.get('/donors', listDonors);

/**
 * @route   GET /api/v1/admin/hospitals
 * @desc    Get all hospitals list
 * @access  Private (ADMIN)
 */
router.get('/hospitals', listHospitals);

/**
 * @route   GET /api/v1/admin/requests
 * @desc    Get all requests list
 * @access  Private (ADMIN)
 */
router.get('/requests', listRequests);

router.get('/organizations/pending', listPendingOrganizations);
router.patch(
  '/organizations/:userId/verification',
  validateBody(updateVerificationStatusSchema),
  updateOrganizationVerification,
);

export default router;
