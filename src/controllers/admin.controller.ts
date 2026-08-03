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
export const getSystemMetrics = catchAsync(async (_req: Request, res: Response) => {
  const metrics = await adminService.getSystemMetrics();
  sendSuccess(res, metrics, 'System metrics retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/admin/activity
 * @desc Get a feed of recent platform activity
 * @access Private (ADMIN)
 */
export const getRecentActivity = catchAsync(async (_req: Request, res: Response) => {
  const activity = await adminService.getRecentActivity();
  sendSuccess(res, activity, 'Recent activity retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/admin/inventory
 * @desc Get aggregated blood inventory grouped by blood type
 * @access Private (ADMIN)
 */
export const getInventoryByBloodType = catchAsync(async (_req: Request, res: Response) => {
  const inventory = await adminService.getInventoryByBloodType();
  sendSuccess(res, inventory, 'Global inventory retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/admin/donors
 * @desc Get all registered donors
 * @access Private (ADMIN)
 */
export const listDonors = catchAsync(async (_req: Request, res: Response) => {
  const result = await adminService.getAllDonors();
  sendSuccess(res, result, 'All donors retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/admin/hospitals
 * @desc Get all registered hospitals
 * @access Private (ADMIN)
 */
export const listHospitals = catchAsync(async (_req: Request, res: Response) => {
  const result = await adminService.getAllHospitals();
  sendSuccess(res, result, 'All hospitals retrieved successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/admin/requests
 * @desc Get all blood requests
 * @access Private (ADMIN)
 */
export const listRequests = catchAsync(async (_req: Request, res: Response) => {
  const result = await adminService.getAllRequests();
  sendSuccess(res, result, 'All requests retrieved successfully', HttpStatus.OK);
});
