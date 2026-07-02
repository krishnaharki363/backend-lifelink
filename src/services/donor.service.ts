/**
 * @file donor.service.ts
 * @description Business logic for donor search and matching.
 */

import { prisma } from '@config/database';
import { BloodType } from '@prisma/client';
import type { SearchDonorsQuery } from '@validators/donor.validators';

// ─── Compatibility Logic ──────────────────────────────────────────────────────

/**
 * Returns an array of blood types that a patient with `patientBloodType` can safely receive.
 */
const getCompatibleBloodTypes = (patientBloodType: BloodType): BloodType[] => {
  switch (patientBloodType) {
    case BloodType.A_POS:
      return [BloodType.A_POS, BloodType.A_NEG, BloodType.O_POS, BloodType.O_NEG];
    case BloodType.O_POS:
      return [BloodType.O_POS, BloodType.O_NEG];
    case BloodType.B_POS:
      return [BloodType.B_POS, BloodType.B_NEG, BloodType.O_POS, BloodType.O_NEG];
    case BloodType.AB_POS:
      return [
        BloodType.AB_POS, BloodType.AB_NEG,
        BloodType.A_POS, BloodType.A_NEG,
        BloodType.B_POS, BloodType.B_NEG,
        BloodType.O_POS, BloodType.O_NEG,
      ];
    case BloodType.A_NEG:
      return [BloodType.A_NEG, BloodType.O_NEG];
    case BloodType.O_NEG:
      return [BloodType.O_NEG];
    case BloodType.B_NEG:
      return [BloodType.B_NEG, BloodType.O_NEG];
    case BloodType.AB_NEG:
      return [BloodType.AB_NEG, BloodType.A_NEG, BloodType.B_NEG, BloodType.O_NEG];
    default:
      return [patientBloodType];
  }
};

// ─── Business Logic ───────────────────────────────────────────────────────────

/**
 * Searches for donors based on patient blood type and location.
 * Automatically applies universal compatibility logic.
 *
 * @param query Search filters from the request
 */
export const searchCompatibleDonors = async (query: SearchDonorsQuery) => {
  const { page, limit, bloodType, city, state } = query;
  const skip = (page - 1) * limit;

  // Determine all compatible blood types the patient can receive
  const compatibleTypes = getCompatibleBloodTypes(bloodType);

  // Build the dynamic WHERE clause
  const whereClause: any = {
    // Only search active donors (not soft-deleted users)
    user: { isActive: true },
    bloodType: { in: compatibleTypes },
  };

  if (city) {
    whereClause.city = { contains: city, mode: 'insensitive' };
  }
  
  if (state) {
    whereClause.state = { contains: state, mode: 'insensitive' };
  }

  // Execute query and count in parallel
  const [donors, total] = await Promise.all([
    prisma.donorProfile.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { lastDonationDate: 'asc' }, // Prioritize those who haven't donated recently
      select: {
        id: true,
        firstName: true,
        lastName: true,
        bloodType: true,
        city: true,
        state: true,
        phone: true,
        lastDonationDate: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    }),
    prisma.donorProfile.count({ where: whereClause }),
  ]);

  return {
    data: donors,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      searchedBloodType: bloodType,
      compatibleTypesIncluded: compatibleTypes,
    },
  };
};
