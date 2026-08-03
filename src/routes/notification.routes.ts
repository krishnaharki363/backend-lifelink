/**
 * @file notification.routes.ts
 * @description Routes for Notification APIs.
 */

import { Router } from 'express';
import { authenticate } from '@middleware/auth.middleware';
import * as notificationController from '@controllers/notification.controller';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/notifications
 * @desc    Get all notifications for the authenticated user
 * @access  Private
 */
router.get('/', notificationController.getNotifications);

/**
 * @route   PATCH /api/v1/notifications/:id/read
 * @desc    Mark a notification as read
 * @access  Private
 */
router.patch('/:id/read', notificationController.markAsRead);

export default router;
