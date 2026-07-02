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
