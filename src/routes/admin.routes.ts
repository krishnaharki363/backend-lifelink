/**
 * @file admin.routes.ts
 * @description Routes for Admin Analytics APIs.
 */

import { Router } from 'express';
import { getSystemMetrics, getRecentActivity, getInventoryByBloodType } from '@controllers/admin.controller';
import { authenticate, authorize } from '@middleware/auth.middleware';
import { Role } from '@prisma/client';

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

export default router;
