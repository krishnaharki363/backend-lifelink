/**
 * @file admin.service.ts
 * @description Business logic and database aggregations for Admin Analytics.
 */

import { prisma } from '@config/database';
import { RequestStatus, Role, type Role as RoleType } from '@prisma/client';
import {
  VerificationStatus,
  type VerificationStatus as VerificationStatusType,
} from '@constants/verification.constants';
import { AppError } from '@utils/AppError';

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
  const usersByRole = userCounts.reduce(
    (acc, curr) => {
      acc[curr.role] = curr._count.id;
      return acc;
    },
    {} as Record<RoleType, number>,
  );

  const totalUsers = Object.values(usersByRole).reduce((a, b) => a + b, 0);

  return {
    users: {
      total: totalUsers,
      byRole: usersByRole,
    },
    activeBloodRequests: activeRequests,
    totalBloodUnitsAvailable: totalInventoryResult._sum.unitsAvailable ?? 0,
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
    totalUnits: group._sum.unitsAvailable ?? 0,
  }));
};

/**
 * Retrieves all registered donors for administration.
 */
export const getAllDonors = async () => {
  return prisma.donorProfile.findMany({
    include: {
      user: {
        select: {
          email: true,
          isActive: true,
        },
      },
    },
    orderBy: {
      lastName: 'asc',
    },
  });
};

/**
 * Retrieves all registered hospitals for administration.
 */
export const getAllHospitals = async () => {
  return prisma.hospitalProfile.findMany({
    include: {
      user: {
        select: {
          email: true,
          isActive: true,
        },
      },
      bloodRequests: {
        select: {
          id: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
};

/**
 * Retrieves all platform blood requests for administration.
 */
export const getAllRequests = async () => {
  return prisma.bloodRequest.findMany({
    include: {
      hospital: {
        select: {
          name: true,
          address: true,
        },
      },
      matchedDonor: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      matchedBloodBank: {
        select: {
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
};

export const getPendingOrganizations = async () => {
  return prisma.user.findMany({
    where: {
      role: { in: [Role.HOSPITAL, Role.BLOOD_BANK] },
      verificationStatus: VerificationStatus.PENDING,
    },
    select: {
      id: true,
      email: true,
      role: true,
      verificationStatus: true,
      createdAt: true,
      hospitalProfile: { select: { name: true, licenseNumber: true, address: true, phone: true } },
      bloodBankProfile: { select: { name: true, licenseNumber: true, address: true, phone: true } },
    },
    orderBy: { createdAt: 'asc' },
  } as never);
};

export const updateOrganizationVerification = async (
  userId: string,
  status: VerificationStatusType,
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || (user.role !== Role.HOSPITAL && user.role !== Role.BLOOD_BANK)) {
    throw AppError.notFound('Organization account not found');
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      verificationStatus: status,
      isActive: status !== VerificationStatus.REJECTED,
    },
    select: { id: true, email: true, role: true, verificationStatus: true, isActive: true },
  });
};
