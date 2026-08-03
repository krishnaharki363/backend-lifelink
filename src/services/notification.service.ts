/**
 * @file notification.service.ts
 * @description Business logic for handling user notifications.
 */

import { prisma } from '@config/database';
import { AppError } from '@utils/AppError';

/**
 * Creates a new notification for a specific user.
 */
export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: string
) => {
  return prisma.notification.create({
    data: {
      userId,
      title,
      message,
      type,
    },
  });
};

/**
 * Retrieves all notifications for a user, ordered by most recent.
 */
export const getUserNotifications = async (userId: string) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
};

/**
 * Marks a specific notification as read.
 */
export const markNotificationAsRead = async (id: string, userId: string) => {
  const notification = await prisma.notification.findUnique({
    where: { id },
  });

  if (!notification) {
    throw AppError.notFound('Notification not found');
  }

  if (notification.userId !== userId) {
    throw AppError.forbidden('You do not have permission to access this notification');
  }

  return prisma.notification.update({
    where: { id },
    data: { read: true },
  });
};
