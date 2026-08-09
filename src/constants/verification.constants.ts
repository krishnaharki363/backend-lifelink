export const VerificationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];
