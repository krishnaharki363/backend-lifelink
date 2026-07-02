/**
 * @file admin.controller.ts
 * @description Controllers for Admin Analytics. 
 * These endpoints are strictly protected by RBAC (ADMIN role only).
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import { HttpStatus } from '@constants/http.constants';
import * as adminService from '@services/admin.service';

/**
 * GET /api/v1/admin/metrics
 * @desc Get high-level system metrics (total users, active requests, inventory)
 * @access Private (ADMIN)
 */
export const getSystemMetrics = catchAsync(async (req: Request, res: Response) => {
  const metrics = await adminService.getSystemMetrics();
  sendSuccess(res, metrics, 'System metrics retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/admin/activity
 * @desc Get a feed of recent platform activity
 * @access Private (ADMIN)
 */
export const getRecentActivity = catchAsync(async (req: Request, res: Response) => {
  const activity = await adminService.getRecentActivity();
  sendSuccess(res, activity, 'Recent activity retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/admin/inventory
 * @desc Get aggregated blood inventory grouped by blood type
 * @access Private (ADMIN)
 */
export const getInventoryByBloodType = catchAsync(async (req: Request, res: Response) => {
  const inventory = await adminService.getInventoryByBloodType();
  sendSuccess(res, inventory, 'Global inventory retrieved successfully', HttpStatus.OK);
});
