/**
 * @file inventory.service.ts
 * @description Business logic for managing blood inventory.
 */

import { prisma } from '@config/database';
import { AppError } from '@utils/AppError';
import type { UpdateInventoryInput } from '@validators/inventory.validators';

/**
 * Updates or creates an inventory record for a specific blood bank.
 * Only Blood Banks can manage their inventory.
 *
 * @param userId - ID of the authenticated user
 * @param data - The inventory data (bloodType, unitsAvailable)
 */
export const updateInventory = async (userId: string, data: UpdateInventoryInput) => {
  // 1. Verify user is a registered blood bank
  const bloodBankProfile = await prisma.bloodBankProfile.findUnique({
    where: { userId },
  });

  if (!bloodBankProfile) {
    throw AppError.forbidden('Only registered blood banks can update inventory');
  }

  // 2. Upsert the inventory record
  // Prisma's upsert uses the unique composite constraint we defined in the schema
  // @@unique([bloodBankId, bloodType])
  const inventory = await prisma.bloodInventory.upsert({
    where: {
      bloodBankId_bloodType: {
        bloodBankId: bloodBankProfile.id,
        bloodType: data.bloodType,
      },
    },
    update: {
      unitsAvailable: data.unitsAvailable,
    },
    create: {
      bloodBankId: bloodBankProfile.id,
      bloodType: data.bloodType,
      unitsAvailable: data.unitsAvailable,
    },
    include: {
      bloodBank: {
        select: { name: true, address: true, phone: true },
      },
    },
  });

  return inventory;
};

/**
 * Retrieves a high-level overview of the system's blood inventory,
 * grouped by blood bank.
 */
export const getSystemInventory = async () => {
  // Fetch all inventory records, grouped by Blood Bank
  const inventories = await prisma.bloodInventory.findMany({
    orderBy: { bloodType: 'asc' },
    include: {
      bloodBank: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
    },
  });

  // Future Enhancement: We could aggregate total units across the system
  // by blood type using Prisma's groupBy, but returning the detailed list
  // is more useful for hospitals looking for specific local stock.

  return inventories;
};
