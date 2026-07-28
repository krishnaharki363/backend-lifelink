import { z } from 'zod';
import { BloodType } from '@prisma/client';

export const bloodTypeSchema = z.string().transform((val, ctx) => {
  const map: Record<string, BloodType> = {
    'A+': BloodType.A_POS,
    'A-': BloodType.A_NEG,
    'B+': BloodType.B_POS,
    'B-': BloodType.B_NEG,
    'AB+': BloodType.AB_POS,
    'AB-': BloodType.AB_NEG,
    'O+': BloodType.O_POS,
    'O-': BloodType.O_NEG,
    // Fallbacks just in case the frontend already sends Prisma format
    'A_POS': BloodType.A_POS,
    'A_NEG': BloodType.A_NEG,
    'B_POS': BloodType.B_POS,
    'B_NEG': BloodType.B_NEG,
    'AB_POS': BloodType.AB_POS,
    'AB_NEG': BloodType.AB_NEG,
    'O_POS': BloodType.O_POS,
    'O_NEG': BloodType.O_NEG,
  };
  const mapped = map[val.trim().toUpperCase()];
  if (!mapped) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid blood type' });
    return z.NEVER;
  }
  return mapped;
});
