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
export const createBloodRequest = async (
  userId: string,
  data: CreateBloodRequestInput
) => {
  // 1. Ensure the user actually has a Hospital profile
  const hospitalProfile = await prisma.hospitalProfile.findUnique({
    where: { userId },
  });

  if (!hospitalProfile) {
    throw AppError.forbidden('Only registered hospitals can create blood requests');
  }

  // 2. Try Path A: Check if any blood bank has enough inventory
  const inventoryMatch = await prisma.bloodInventory.findFirst({
    where: {
      bloodType: data.bloodType,
      unitsAvailable: { gte: data.unitsRequired },
    },
    include: { bloodBank: true },
  });

  let request;

  if (inventoryMatch) {
    // Inventory match found! Create request as MATCHED_INVENTORY
    request = await prisma.bloodRequest.create({
      data: {
        ...data,
        hospitalId: hospitalProfile.id,
        status: RequestStatus.MATCHED_INVENTORY,
        matchedBloodBankId: inventoryMatch.bloodBankId,
      },
      select: SELECT_REQUEST_DETAILS,
    });

    // Notify Hospital
    await notificationService.createNotification(
      userId,
      'Request Matched (Inventory)',
      `Your request for ${data.unitsRequired.toString()} units of ${data.bloodType} has been automatically matched with inventory from ${inventoryMatch.bloodBank.name}.`,
      'REQUEST_MATCH_INVENTORY'
    );

    // Notify Blood Bank
    await notificationService.createNotification(
      inventoryMatch.bloodBank.userId,
      'Blood Request Matched from Stock',
      `A blood request for ${data.unitsRequired.toString()} units of ${data.bloodType} from ${hospitalProfile.name} has been matched to your stock. Please confirm delivery.`,
      'REQUEST_MATCH_INVENTORY_BANK'
    );
  } else {
    // No inventory match. Create request as PENDING
    request = await prisma.bloodRequest.create({
      data: {
        ...data,
        hospitalId: hospitalProfile.id,
        status: RequestStatus.PENDING,
      },
      select: SELECT_REQUEST_DETAILS,
    });

    // Path B Alert: Find all donors with matching bloodType who have notifications enabled
    const matchingDonors = await prisma.donorProfile.findMany({
      where: {
        bloodType: data.bloodType,
        notificationsEnabled: true,
        availableToDonate: true,
      },
    });

    // Notify matching donors
    for (const donor of matchingDonors) {
      await notificationService.createNotification(
        donor.userId,
        'Compatible Blood Request Posted',
        `An urgent request for blood type ${data.bloodType} (${data.urgency}) is needed at ${hospitalProfile.name}. Click to accept this request directly.`,
        'REQUEST_ALERT'
      );
    }
  }

  return request;
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
    whereClause.matchedBloodBankId = matchedBloodBankId;
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
    'REQUEST_ACCEPTED_SELF'
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

    if (request.status !== RequestStatus.MATCHED_INVENTORY || request.matchedBloodBankId !== bloodBank.id) {
      throw AppError.forbidden('This request is not matched with your center or is already confirmed');
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

    // Authorization check
    if (role === Role.HOSPITAL && request.hospital.userId !== userId) {
      throw AppError.forbidden('You do not have permission to fulfill this request');
    }
    if (role === Role.BLOOD_BANK && request.matchedBloodBank?.userId !== userId) {
      throw AppError.forbidden('You do not have permission to fulfill this request');
    }

    // If inventory matched path, deduct stock
    if (request.status === RequestStatus.MATCHED_INVENTORY || request.status === RequestStatus.IN_DELIVERY) {
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
          },
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
  data: UpdateBloodRequestStatusInput
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

  // General check for updates (Hospital own or Admin)
  if (userRole !== Role.ADMIN && request.hospital.userId !== userId) {
    throw AppError.forbidden('You do not have permission to update this request');
  }

  const updatedRequest = await prisma.bloodRequest.update({
    where: { id },
    data: { status: newStatus },
    select: SELECT_REQUEST_DETAILS,
  });

  // Notify matched entities of cancellation or state change
  if (newStatus === RequestStatus.CANCELLED) {
    if (request.matchedDonorId && request.matchedDonor) {
      await notificationService.createNotification(
        request.matchedDonor.user.id,
        'Matched Request Cancelled',
        `The request for ${request.bloodType} from ${request.hospital.name} you accepted has been cancelled.`,
        'REQUEST_CANCELLED_ALERT'
      );
    } else if (request.matchedBloodBankId && request.matchedBloodBank) {
      await notificationService.createNotification(
        request.matchedBloodBank.user.id,
        'Matched Request Cancelled',
        `The request for ${request.bloodType} from ${request.hospital.name} matched with your center has been cancelled.`,
        'REQUEST_CANCELLED_ALERT'
      );
    }
  }

  return updatedRequest;
};
