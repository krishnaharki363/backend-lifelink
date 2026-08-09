import { z } from 'zod';
import { VerificationStatus } from '@constants/verification.constants';

export const updateVerificationStatusSchema = z.object({
  status: z.enum([VerificationStatus.APPROVED, VerificationStatus.REJECTED]),
});

export type UpdateVerificationStatusInput = z.infer<typeof updateVerificationStatusSchema>;
