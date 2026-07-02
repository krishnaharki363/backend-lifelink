/**
 * @file bloodRequest.service.ts
 * @description Business logic for handling blood requests.
 */

import { prisma } from '@config/database';
import { AppError } from '@utils/AppError';
import { Role } from '@prisma/client';
import type {
  CreateBloodRequestInput,
  GetBloodRequestsQuery,
  UpdateBloodRequestStatusInput,
} from '@validators/bloodRequest.validators';

// ─── Constants ────────────────────────────────────────────────────────────────

const SELECT_REQUEST_DETAILS = {
  id: true,
  patientName: true,
  bloodType: true,
  unitsRequired: true,
  urgency: true,
  status: true,
  requiredByDate: true,
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
};

// ─── Business Logic ───────────────────────────────────────────────────────────

/**
 * Creates a new blood request.
 * Only Hospitals can create blood requests.
 *
 * @param userId - The ID of the authenticated user making the request
 * @param data - The validated request payload
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

  // 2. Create the request
  const request = await prisma.bloodRequest.create({
    data: {
      ...data,
      hospitalId: hospitalProfile.id,
    },
    select: SELECT_REQUEST_DETAILS,
  });

  // Future Enhancement: If Urgency is CRITICAL, trigger an event here
  // to notify nearby matching donors via SMS/Email.

  return request;
};

/**
 * Retrieves a paginated and optionally filtered list of blood requests.
 */
export const getBloodRequests = async (query: GetBloodRequestsQuery) => {
  const { page, limit, bloodType, status, urgency } = query;
  const skip = (page - 1) * limit;

  // Build the dynamic WHERE clause
  const whereClause: any = {};
  if (bloodType) whereClause.bloodType = bloodType;
  if (status) whereClause.status = status;
  if (urgency) whereClause.urgency = urgency;

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
 * Updates the status of an existing blood request.
 * - Admins can update any request.
 * - Hospitals can only update their own requests.
 */
export const updateBloodRequestStatus = async (
  id: string,
  userId: string,
  userRole: Role,
  data: UpdateBloodRequestStatusInput
) => {
  const request = await prisma.bloodRequest.findUnique({
    where: { id },
    include: { hospital: true },
  });

  if (!request) {
    throw AppError.notFound('Blood request not found');
  }

  // Authorization check: If not an admin, they must own the hospital profile
  if (userRole !== Role.ADMIN && request.hospital.userId !== userId) {
    throw AppError.forbidden('You do not have permission to update this request');
  }

  const updatedRequest = await prisma.bloodRequest.update({
    where: { id },
    data: { status: data.status },
    select: SELECT_REQUEST_DETAILS,
  });

  return updatedRequest;
};
