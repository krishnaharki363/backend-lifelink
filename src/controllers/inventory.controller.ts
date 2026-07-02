/**
 * @file inventory.controller.ts
 * @description Controller for Inventory API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as inventoryService from '@services/inventory.service';
import { HttpStatus } from '@constants/http.constants';

/**
 * PUT /api/v1/inventory
 * Updates blood bank inventory.
 */
export const updateInventory = catchAsync(async (req: Request, res: Response) => {
  const result = await inventoryService.updateInventory(req.user!.userId, req.body);

  sendSuccess(res, result, 'Inventory updated successfully', HttpStatus.OK);
});

/**
 * GET /api/v1/inventory
 * Retrieves system-wide blood inventory.
 */
export const getSystemInventory = catchAsync(async (_req: Request, res: Response) => {
  const result = await inventoryService.getSystemInventory();

  sendSuccess(res, result, 'System inventory retrieved successfully', HttpStatus.OK);
});
