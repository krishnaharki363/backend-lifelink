/**
 * @file donor.validators.ts
 * @description Zod schemas for validating Donor Search API payloads.
 */

import { z } from 'zod';
import { BloodType } from '@prisma/client';

export const searchDonorsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  bloodType: z.nativeEnum(BloodType, { errorMap: () => ({ message: 'Invalid blood type' }) }),
  city: z.string().min(2, 'City must be at least 2 characters').optional(),
  state: z.string().min(2, 'State must be at least 2 characters').optional(),
});

export type SearchDonorsQuery = z.infer<typeof searchDonorsQuerySchema>;

export const updateDonorProfileSchema = z.object({
  phone: z.string().min(5, 'Phone must be at least 5 characters').optional(),
  province: z.string().optional(),
  district: z.string().optional(),
  municipality: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  availableToDonate: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  preferredContactMethod: z.string().optional(),
});

export type UpdateDonorProfileInput = z.infer<typeof updateDonorProfileSchema>;
