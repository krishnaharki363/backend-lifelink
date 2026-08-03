/**
 * @file bloodBank.service.ts
 * @description Business logic for querying blood bank profiles.
 */

import { prisma } from '@config/database';

/**
 * Retrieves all registered blood bank profiles.
 */
export const getAllBloodBanks = async () => {
  return prisma.bloodBankProfile.findMany({
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
    },
    orderBy: {
      name: 'asc',
    },
  });
};
