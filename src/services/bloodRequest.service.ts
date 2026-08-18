/**
 * @file bloodRequest.service.ts
 * @description Business logic for handling blood requests and matching.
 */

import { prisma } from '@config/database';
import { AppError } from '@utils/AppError';
import { Role, RequestStatus } from '@prisma/client';
import type {
  CreateBloodRequestInput,
  GetBloodRequestsQuery,
  UpdateBloodRequestStatusInput,
} from '@validators/bloodRequest.validators';
import * as notificationService from '@services/notification.service';

const FULFILLABLE_REQUEST_STATUSES: RequestStatus[] = [
  RequestStatus.MATCHED_DONOR,
  RequestStatus.MATCHED_INVENTORY,
  RequestStatus.IN_DELIVERY,
];

// ─── Constants ────────────────────────────────────────────────────────────────

const SELECT_REQUEST_DETAILS = {
  id: true,
  patientName: true,
  bloodType: true,
  unitsRequired: true,
  urgency: true,
  status: true,
  requiredByDate: true,
  ward: true,
  notes: true,
  createdAt: true,
  hospital: {
    select: {
      id: true,
      name: true,
      address: true,
      contactPerson: true,
      phone: true,
    },
  },
  matchedDonorId: true,
  matchedDonor: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  },
  matchedBloodBankId: true,
  matchedBloodBank: {
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
    },
  },
};

// ─── Business Logic ───────────────────────────────────────────────────────────

/**
 * Creates a new blood request.
 * Checks inventory for Path A matching, otherwise alerts matching donors for Path B.
 */
export const createBloodRequest = async (userId: string, data: CreateBloodRequestInput) => {
  // 1. Ensure the user actually has a Hospital profile
  const hospitalProfile = await prisma.hospitalProfile.findUnique({
    where: { userId },
  });

  if (!hospitalProfile) {
    throw AppError.forbidden('Only registered hospitals can create blood requests');
  }

  // Lock the first eligible inventory row while creating the request. The
  // reserved quantity is updated in the same transaction, so concurrent
  // hospitals cannot claim the same units.
  const result = await prisma.$transaction(async (tx) => {
    const inventoryIds = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "blood_inventories"
      WHERE "bloodType" = ${data.bloodType}::"BloodType"
        AND "unitsAvailable" - "unitsReserved" >= ${data.unitsRequired}
      ORDER BY "lastUpdated" ASC
      LIMIT 1
      FOR UPDATE
    `;

    const inventoryMatch = inventoryIds[0]
      ? await tx.bloodInventory.findUnique({
          where: { id: inventoryIds[0].id },
          include: { bloodBank: true },
        })
      : null;

    if (inventoryMatch) {
      await tx.bloodInventory.update({
        where: { id: inventoryMatch.id },
        data: { unitsReserved: { increment: data.unitsRequired } } as never,
      });

      const request = await tx.bloodRequest.create({
        data: {
          ...data,
          hospitalId: hospitalProfile.id,
          status: RequestStatus.MATCHED_INVENTORY,
          matchedBloodBankId: inventoryMatch.bloodBankId,
        },
        select: SELECT_REQUEST_DETAILS,
      });

      return { request, inventoryMatch, matchingDonors: [] };
    }

    const request = await tx.bloodRequest.create({
      data: {
        ...data,
        hospitalId: hospitalProfile.id,
        status: RequestStatus.PENDING,
      },
      select: SELECT_REQUEST_DETAILS,
    });

    const matchingDonors = await tx.donorProfile.findMany({
      where: {
        bloodType: data.bloodType,
        notificationsEnabled: true,
        availableToDonate: true,
      },
      select: { userId: true },
    });

    return { request, inventoryMatch: null, matchingDonors };
  });

  if (result.inventoryMatch) {
    await notificationService.createNotification(
      userId,
      'Request Matched (Inventory)',
      `Your request for ${data.unitsRequired.toString()} units of ${data.bloodType} has been automatically matched with inventory from ${result.inventoryMatch.bloodBank.name}.`,
      'REQUEST_MATCH_INVENTORY',
    );
    await notificationService.createNotification(
      result.inventoryMatch.bloodBank.userId,
      'Blood Request Matched from Stock',
      `A blood request for ${data.unitsRequired.toString()} units of ${data.bloodType} from ${hospitalProfile.name} has been matched to your stock. Please confirm delivery.`,
      'REQUEST_MATCH_INVENTORY_BANK',
    );
  } else {
    for (const donor of result.matchingDonors) {
      await notificationService.createNotification(
        donor.userId,
        'Compatible Blood Request Posted',
        `An urgent request for blood type ${data.bloodType} (${data.urgency}) is needed at ${hospitalProfile.name}. Click to accept this request directly.`,
        'REQUEST_ALERT',
      );
    }
  }

  return result.request;
};

/**
 * Retrieves a paginated and optionally filtered list of blood requests.
 */
export const getBloodRequests = async (query: GetBloodRequestsQuery) => {
  const { page, limit, bloodType, status, urgency, hospitalId, matchedBloodBankId } = query;
  const skip = (page - 1) * limit;

  // Build the dynamic WHERE clause
  const whereClause: Record<string, unknown> = {};
  if (bloodType) {
    whereClause.bloodType = bloodType;
  }
  if (status) {
    whereClause.status = status;
  }
  if (urgency) {
    whereClause.urgency = urgency;
  }
  if (hospitalId) {
    whereClause.hospitalId = hospitalId;
  }
  if (matchedBloodBankId) {
    // A bank sees its assigned matches plus open requests it may claim.
    whereClause.OR = [
      { matchedBloodBankId },
      { status: RequestStatus.PENDING, matchedBloodBankId: null },
    ];
  }

  // Execute query and count in parallel for pagination metadata
  const [requests, total] = await Promise.all([
    prisma.bloodRequest.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: [
        // Order by urgency first (CRITICAL at the top)
        { urgency: 'desc' },
        // Then by required date (closest first)
        { requiredByDate: 'asc' },
      ],
      select: SELECT_REQUEST_DETAILS,
    }),
    prisma.bloodRequest.count({ where: whereClause }),
  ]);

  return {
    data: requests,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Retrieves a single blood request by ID.
 */
export const getBloodRequestById = async (id: string) => {
  const request = await prisma.bloodRequest.findUnique({
    where: { id },
    select: SELECT_REQUEST_DETAILS,
  });

  if (!request) {
    throw AppError.notFound('Blood request not found');
  }

  return request;
};

/**
 * Donor accepts a pending blood request directly (Path B).
 */
export const acceptBloodRequest = async (id: string, userId: string) => {
  const donor = await prisma.donorProfile.findUnique({
    where: { userId },
  });

  if (!donor) {
    throw AppError.forbidden('Only registered donors can accept blood requests');
  }

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.bloodRequest.findUnique({
      where: { id },
      include: { hospital: { include: { user: true } } },
    });

    if (!request) {
      throw AppError.notFound('Blood request not found');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw AppError.conflict('This request is no longer open for matching');
    }

    const updated = await tx.bloodRequest.update({
      where: { id },
      data: {
        status: RequestStatus.MATCHED_DONOR,
        matchedDonorId: donor.id,
      },
      select: SELECT_REQUEST_DETAILS,
    });

    // Notify Hospital/requester
    await tx.notification.create({
      data: {
        userId: request.hospital.user.id,
        title: 'Request Accepted',
        message: `Donor ${donor.firstName} ${donor.lastName} has accepted your request for ${request.bloodType}. Contact: ${donor.phone}`,
        type: 'REQUEST_ACCEPTED_DONOR',
      },
    });

    return updated;
  });

  // Notify donor
  await notificationService.createNotification(
    userId,
    'Request Accepted',
    `You have accepted the request for ${result.bloodType}. The hospital has been notified.`,
    'REQUEST_ACCEPTED_SELF',
  );

  return result;
};

/**
 * Blood bank confirms inventory match (transitions to IN_DELIVERY).
 */
export const confirmInventoryMatch = async (id: string, userId: string) => {
  const bloodBank = await prisma.bloodBankProfile.findUnique({
    where: { userId },
  });

  if (!bloodBank) {
    throw AppError.forbidden('Only registered blood banks can confirm delivery');
  }

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.bloodRequest.findUnique({
      where: { id },
      include: { hospital: { include: { user: true } } },
    });

    if (!request) {
      throw AppError.notFound('Blood request not found');
    }

    if (
      request.status !== RequestStatus.MATCHED_INVENTORY ||
      request.matchedBloodBankId !== bloodBank.id
    ) {
      throw AppError.forbidden(
        'This request is not matched with your center or is already confirmed',
      );
    }

    const updated = await tx.bloodRequest.update({
      where: { id },
      data: { status: RequestStatus.IN_DELIVERY },
      select: SELECT_REQUEST_DETAILS,
    });

    // Notify Hospital/requester
    await tx.notification.create({
      data: {
        userId: request.hospital.user.id,
        title: 'Blood in Transit',
        message: `${bloodBank.name} has confirmed your match and the units are now in transit/delivery.`,
        type: 'REQUEST_IN_DELIVERY',
      },
    });

    return updated;
  });

  return result;
};

/**
 * Rejects a pre-delivery inventory match and reopens the request for donors.
 */
export const rejectInventoryMatch = async (id: string, userId: string) => {
  const bloodBank = await prisma.bloodBankProfile.findUnique({ where: { userId } });
  if (!bloodBank) {
    throw AppError.forbidden('Only registered blood banks can reject inventory matches');
  }

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.bloodRequest.findUnique({
      where: { id },
      include: {
        hospital: { include: { user: true } },
        matchedBloodBank: { include: { user: true } },
      },
    });

    if (!request) {
      throw AppError.notFound('Blood request not found');
    }

    if (
      request.status !== RequestStatus.MATCHED_INVENTORY ||
      request.matchedBloodBankId !== bloodBank.id
    ) {
      throw AppError.conflict('Only a pending inventory match can be rejected');
    }

    const inventory = await tx.bloodInventory.findUnique({
      where: {
        bloodBankId_bloodType: {
          bloodBankId: bloodBank.id,
          bloodType: request.bloodType,
        },
      },
    });

    if (!inventory || inventory.unitsReserved < request.unitsRequired) {
      throw AppError.conflict('Reserved inventory for this match is no longer available');
    }

    await tx.bloodInventory.update({
      where: {
        bloodBankId_bloodType: {
          bloodBankId: bloodBank.id,
          bloodType: request.bloodType,
        },
      },
      data: { unitsReserved: { decrement: request.unitsRequired } } as never,
    });

    const updatedRequest = await tx.bloodRequest.update({
      where: { id },
      data: {
        status: RequestStatus.PENDING,
        matchedBloodBankId: null,
        matchedDonorId: null,
      },
      select: SELECT_REQUEST_DETAILS,
    });

    const matchingDonors = await tx.donorProfile.findMany({
      where: {
        bloodType: request.bloodType,
        notificationsEnabled: true,
        availableToDonate: true,
      },
      select: { userId: true },
    });

    return { updatedRequest, matchingDonors, hospital: request.hospital };
  });

  await notificationService.createNotification(
    result.hospital.user.id,
    'Blood Bank Match Rejected',
    `${bloodBank.name} could not fulfill your request for ${result.updatedRequest.bloodType}. The request is open again for donor matching.`,
    'REQUEST_MATCH_REJECTED',
  );

  for (const donor of result.matchingDonors) {
    await notificationService.createNotification(
      donor.userId,
      'Blood Request Available',
      `A request for blood type ${result.updatedRequest.bloodType} from ${result.hospital.name} is open for donation after the blood bank match was rejected.`,
      'REQUEST_ALERT',
    );
  }

  return result.updatedRequest;
};

/**
 * Claims a pending request for a bank with enough unreserved inventory.
 */
export const claimInventoryMatch = async (id: string, userId: string) => {
  const bloodBank = await prisma.bloodBankProfile.findUnique({ where: { userId } });
  if (!bloodBank) {
    throw AppError.forbidden('Only registered blood banks can claim blood requests');
  }

  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.bloodRequest.findUnique({
      where: { id },
      include: { hospital: { include: { user: true } } },
    });

    if (!request) {
      throw AppError.notFound('Blood request not found');
    }
    if (request.status !== RequestStatus.PENDING || request.matchedBloodBankId) {
      throw AppError.conflict('This request has already been matched or closed');
    }

    const inventoryIds = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id"
      FROM "blood_inventories"
      WHERE "bloodBankId" = ${bloodBank.id}::uuid
        AND "bloodType" = ${request.bloodType}::"BloodType"
        AND "unitsAvailable" - "unitsReserved" >= ${request.unitsRequired}
      LIMIT 1
      FOR UPDATE
    `;
    const inventoryId = inventoryIds[0]?.id;
    if (!inventoryId) {
      throw AppError.conflict('This blood bank does not have enough unreserved inventory');
    }

    await tx.bloodInventory.update({
      where: { id: inventoryId },
      data: { unitsReserved: { increment: request.unitsRequired } } as never,
    });

    const updated = await tx.bloodRequest.update({
      where: { id },
      data: {
        status: RequestStatus.MATCHED_INVENTORY,
        matchedBloodBankId: bloodBank.id,
      },
      select: SELECT_REQUEST_DETAILS,
    });

    await tx.notification.create({
      data: {
        userId: request.hospital.user.id,
        title: 'Blood Bank Responded',
        message: `${bloodBank.name} has reserved ${request.unitsRequired.toString()} unit(s) of ${request.bloodType} for your request.`,
        type: 'REQUEST_MATCH_INVENTORY_BANK',
      },
    });

    return updated;
  });

  await notificationService.createNotification(
    userId,
    'Blood Request Claimed',
    `You reserved inventory for the ${result.bloodType} request from ${result.hospital.name}. Please confirm delivery when ready.`,
    'REQUEST_CLAIMED_SELF',
  );

  return result;
};

/**
 * Fulfills a blood request, deducting stock if it was an inventory match.
 */
export const fulfillBloodRequest = async (id: string, userId: string, role: Role) => {
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.bloodRequest.findUnique({
      where: { id },
      include: {
        hospital: { include: { user: true } },
        matchedBloodBank: { include: { user: true } },
        matchedDonor: { include: { user: true } },
      },
    });

    if (!request) {
      throw AppError.notFound('Blood request not found');
    }

    if (request.status === RequestStatus.FULFILLED) {
      throw AppError.conflict('Request is already fulfilled');
    }

    if (request.status === RequestStatus.CANCELLED) {
      throw AppError.conflict('Cancelled requests cannot be fulfilled');
    }

    if (!FULFILLABLE_REQUEST_STATUSES.includes(request.status)) {
      throw AppError.conflict(`Request cannot be fulfilled from ${request.status} status`);
    }

    // Authorization check
    if (role === Role.HOSPITAL && request.hospital.userId !== userId) {
      throw AppError.forbidden('You do not have permission to fulfill this request');
    }
    if (role === Role.BLOOD_BANK && request.matchedBloodBank?.userId !== userId) {
      throw AppError.forbidden('You do not have permission to fulfill this request');
    }

    // If inventory matched path, deduct stock
    if (
      request.status === RequestStatus.MATCHED_INVENTORY ||
      request.status === RequestStatus.IN_DELIVERY
    ) {
      if (request.matchedBloodBankId) {
        const inventory = await tx.bloodInventory.findUnique({
          where: {
            bloodBankId_bloodType: {
              bloodBankId: request.matchedBloodBankId,
              bloodType: request.bloodType,
            },
          },
        });

        if (!inventory || inventory.unitsAvailable < request.unitsRequired) {
          throw AppError.badRequest('Insufficient inventory units to fulfill request');
        }

        await tx.bloodInventory.update({
          where: {
            bloodBankId_bloodType: {
              bloodBankId: request.matchedBloodBankId,
              bloodType: request.bloodType,
            },
          },
          data: {
            unitsAvailable: { decrement: request.unitsRequired },
            unitsReserved: { decrement: request.unitsRequired },
          } as never,
        });
      }
    }

    const updated = await tx.bloodRequest.update({
      where: { id },
      data: { status: RequestStatus.FULFILLED },
      select: SELECT_REQUEST_DETAILS,
    });

    // Notify hospital if completed by blood bank or admin
    if (request.hospital.userId !== userId) {
      await tx.notification.create({
        data: {
          userId: request.hospital.user.id,
          title: 'Request Fulfilled',
          message: `Your request for ${request.bloodType} has been marked as fulfilled.`,
          type: 'REQUEST_FULFILLED',
        },
      });
    }

    // Notify matched donor or blood bank
    if (request.matchedDonorId && request.matchedDonor) {
      await tx.notification.create({
        data: {
          userId: request.matchedDonor.user.id,
          title: 'Request Fulfilled',
          message: `The request from ${request.hospital.name} you accepted has been marked as fulfilled. Thank you!`,
          type: 'DONOR_REQUEST_FULFILLED',
        },
      });
    } else if (request.matchedBloodBankId && request.matchedBloodBank) {
      await tx.notification.create({
        data: {
          userId: request.matchedBloodBank.user.id,
          title: 'Fulfillment Completed',
          message: `The request for ${request.bloodType} from ${request.hospital.name} has been successfully delivered and fulfilled.`,
          type: 'BANK_REQUEST_FULFILLED',
        },
      });
    }

    return updated;
  });

  return result;
};

/**
 * Updates the status of an existing blood request.
 * Coordinates with fulfillBloodRequest when status changes to FULFILLED.
 */
export const updateBloodRequestStatus = async (
  id: string,
  userId: string,
  userRole: Role,
  data: UpdateBloodRequestStatusInput,
) => {
  const request = await prisma.bloodRequest.findUnique({
    where: { id },
    include: {
      hospital: { include: { user: true } },
      matchedDonor: { include: { user: true } },
      matchedBloodBank: { include: { user: true } },
    },
  });

  if (!request) {
    throw AppError.notFound('Blood request not found');
  }

  const newStatus = data.status;

  if (newStatus === RequestStatus.FULFILLED) {
    return fulfillBloodRequest(id, userId, userRole);
  }

  if (newStatus !== RequestStatus.CANCELLED) {
    throw AppError.conflict(
      `Use the matching workflow to transition a request from ${request.status}`,
    );
  }

  if (request.status === RequestStatus.CANCELLED) {
    throw AppError.conflict('Closed requests cannot be changed');
  }

  // General check for updates (Hospital own or Admin)
  if (userRole !== Role.ADMIN && request.hospital.userId !== userId) {
    throw AppError.forbidden('You do not have permission to update this request');
  }

  const updatedRequest = await prisma.$transaction(async (tx) => {
    if (
      request.matchedBloodBankId &&
      (request.status === RequestStatus.MATCHED_INVENTORY ||
        request.status === RequestStatus.IN_DELIVERY)
    ) {
      await tx.bloodInventory.update({
        where: {
          bloodBankId_bloodType: {
            bloodBankId: request.matchedBloodBankId,
            bloodType: request.bloodType,
          },
        },
        data: { unitsReserved: { decrement: request.unitsRequired } } as never,
      });
    }

    return tx.bloodRequest.update({
      where: { id },
      data: { status: newStatus },
      select: SELECT_REQUEST_DETAILS,
    });
  });

  // Notify matched entities about cancellation.
  if (request.matchedDonorId && request.matchedDonor) {
    await notificationService.createNotification(
      request.matchedDonor.user.id,
      'Matched Request Cancelled',
      `The request for ${request.bloodType} from ${request.hospital.name} you accepted has been cancelled.`,
      'REQUEST_CANCELLED_ALERT',
    );
  } else if (request.matchedBloodBankId && request.matchedBloodBank) {
    await notificationService.createNotification(
      request.matchedBloodBank.user.id,
      'Matched Request Cancelled',
      `The request for ${request.bloodType} from ${request.hospital.name} matched with your center has been cancelled.`,
      'REQUEST_CANCELLED_ALERT',
    );
  }

  return updatedRequest;
};
