/**
 * @file admin.service.ts
 * @description Business logic and database aggregations for Admin Analytics.
 */

import { prisma } from '@config/database';
import { Role, RequestStatus } from '@prisma/client';

export const getSystemMetrics = async () => {
  // Execute independent aggregation queries concurrently for performance
  const [userCounts, activeRequests, totalInventoryResult] = await Promise.all([
    // Group users by role and count them
    prisma.user.groupBy({
      by: ['role'],
      _count: {
        id: true,
      },
      where: {
        isActive: true,
      },
    }),
    
    // Count pending blood requests
    prisma.bloodRequest.count({
      where: {
        status: RequestStatus.PENDING,
      },
    }),

    // Sum all available blood units across the entire system
    prisma.bloodInventory.aggregate({
      _sum: {
        unitsAvailable: true,
      },
    }),
  ]);

  // Transform raw Prisma groupBy results into a clean key-value object
  const usersByRole = userCounts.reduce((acc, curr) => {
    acc[curr.role] = curr._count.id;
    return acc;
  }, {} as Record<Role, number>);

  const totalUsers = Object.values(usersByRole).reduce((a, b) => a + b, 0);

  return {
    users: {
      total: totalUsers,
      byRole: usersByRole,
    },
    activeBloodRequests: activeRequests,
    totalBloodUnitsAvailable: totalInventoryResult._sum.unitsAvailable || 0,
  };
};

export const getRecentActivity = async () => {
  const [recentRequests, recentUsers] = await Promise.all([
    prisma.bloodRequest.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        hospital: {
          select: { name: true },
        },
      },
    }),
    prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    recentRequests,
    recentUsers,
  };
};

export const getInventoryByBloodType = async () => {
  const inventoryGroups = await prisma.bloodInventory.groupBy({
    by: ['bloodType'],
    _sum: {
      unitsAvailable: true,
    },
    orderBy: {
      bloodType: 'asc',
    },
  });

  return inventoryGroups.map((group) => ({
    bloodType: group.bloodType,
    totalUnits: group._sum.unitsAvailable || 0,
  }));
};
