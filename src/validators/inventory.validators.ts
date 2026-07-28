/**
 * @file inventory.validators.ts
 * @description Zod schemas for validating Inventory API payloads.
 */

import { z } from 'zod';
import { bloodTypeSchema } from './common';

export const updateInventorySchema = z.object({
  bloodType: bloodTypeSchema,
  unitsAvailable: z.number().int().min(0, 'Units available cannot be negative'),
});

export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
