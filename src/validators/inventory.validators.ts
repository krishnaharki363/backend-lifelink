/**
 * @file inventory.validators.ts
 * @description Zod schemas for validating Inventory API payloads.
 */

import { z } from 'zod';
import { BloodType } from '@prisma/client';

export const updateInventorySchema = z.object({
  bloodType: z.nativeEnum(BloodType, { errorMap: () => ({ message: 'Invalid blood type' }) }),
  unitsAvailable: z.number().int().min(0, 'Units available cannot be negative'),
});

export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
