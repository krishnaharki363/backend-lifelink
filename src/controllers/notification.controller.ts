/**
 * @file notification.controller.ts
 * @description Controller for Notification API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as notificationService from '@services/notification.service';
import { HttpStatus } from '@constants/http.constants';
import { AppError } from '@utils/AppError';

/**
 * GET /api/v1/notifications
 * Retrieves all notifications for the authenticated user.
 */
export const getNotifications = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const result = await notificationService.getUserNotifications(user.userId);
  sendSuccess(res, result, 'Notifications retrieved successfully', HttpStatus.OK);
});

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a notification as read.
 */
export const markAsRead = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const notificationId = req.params.id;
  if (!notificationId) {
    throw AppError.badRequest('Notification ID is required');
  }

  const result = await notificationService.markNotificationAsRead(
    notificationId,
    user.userId
  );
  sendSuccess(res, result, 'Notification marked as read', HttpStatus.OK);
});
