/**
 * @file bloodRequest.validators.ts
 * @description Zod schemas for validating blood request API payloads.
 */

import { z } from 'zod';
import { RequestUrgency, RequestStatus } from '@prisma/client';
import { bloodTypeSchema } from './common';

/**
 * Schema for creating a new blood request.
 */
export const createBloodRequestSchema = z.object({
  patientName: z.string().min(2, 'Patient name must be at least 2 characters'),
  bloodType: bloodTypeSchema,
  unitsRequired: z.number().int().positive('Units required must be at least 1'),
  urgency: z.nativeEnum(RequestUrgency).optional().default(RequestUrgency.NORMAL),

  // Accept ISO strings and coerce them into Date objects.
  // Ensure the required date is in the future.
  requiredByDate: z.string().pipe(
    z.coerce.date().refine((date) => date > new Date(), {
      message: 'Required by date must be in the future',
    })
  ),

  // Ward / department — sent by HospitalDashboard "New Request" modal
  ward: z.string().max(100).optional(),

  notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
});

export type CreateBloodRequestInput = z.infer<typeof createBloodRequestSchema>;

/**
 * Schema for updating the status of an existing blood request.
 */
export const updateBloodRequestStatusSchema = z.object({
  status: z.nativeEnum(RequestStatus, { errorMap: () => ({ message: 'Invalid status' }) }),
});

export type UpdateBloodRequestStatusInput = z.infer<typeof updateBloodRequestStatusSchema>;

/**
 * Schema for querying/filtering blood requests (Pagination & Filters).
 * Since query parameters are always strings, we must coerce them.
 */
export const getBloodRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  bloodType: bloodTypeSchema.optional(),
  status: z.nativeEnum(RequestStatus).optional(),
  urgency: z.nativeEnum(RequestUrgency).optional(),
  hospitalId: z.string().uuid().optional(),
  matchedBloodBankId: z.string().uuid().optional(),
});

export type GetBloodRequestsQuery = z.infer<typeof getBloodRequestsQuerySchema>;
