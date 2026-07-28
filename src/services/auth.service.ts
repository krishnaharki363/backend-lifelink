/**
 * @file auth.service.ts
 * @description Business logic for authentication (Register, Login, Token generation).
 */

import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '@config/database';
import { env } from '@config/env';
import { AppError } from '@utils/AppError';
import { Role, type DonorProfile } from '@prisma/client';
import type { RegisterRequest, LoginRequest } from '@validators/auth.validators';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  role: Role;
  email: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * The profile fields we surface to the frontend on every auth response.
 * These are stored in localStorage and used by all dashboard pages.
 */
export interface AuthUserPayload {
  id: string;
  email: string;
  role: Role;
  isEmailVerified: boolean;
  // Donor fields
  firstName?: string;
  lastName?: string;
  bloodType?: string;
  phone?: string;
  city?: string;
  state?: string;
  province?: string;
  district?: string;
  municipality?: string;
  address?: string;
  gender?: string;
  availability?: string;
  // Hospital / Blood Bank fields
  name?: string;
}

export interface AuthResponse extends AuthTokens {
  user: AuthUserPayload;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateTokens = (payload: JwtPayload): AuthTokens => {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  });
  return { accessToken, refreshToken };
};

/**
 * Converts a Prisma BloodType enum value (A_POS) to the display string (A+)
 * so the frontend can use it directly without mapping.
 */
const bloodTypeToDisplay = (bt: string): string => {
  const map: Record<string, string> = {
    A_POS: 'A+', A_NEG: 'A-',
    B_POS: 'B+', B_NEG: 'B-',
    AB_POS: 'AB+', AB_NEG: 'AB-',
    O_POS: 'O+', O_NEG: 'O-',
  };
  return map[bt] ?? bt;
};

/**
 * Builds the user payload returned to the frontend from a DonorProfile row.
 */
const buildDonorUserPayload = (
  userId: string,
  email: string,
  role: Role,
  isEmailVerified: boolean,
  profile: Pick<
    DonorProfile,
    | 'firstName' | 'lastName' | 'bloodType' | 'phone'
    | 'city' | 'state' | 'province' | 'district' | 'municipality' | 'address'
    | 'gender' | 'availableToDonate'
  >,
): AuthUserPayload => ({
  id: userId,
  email,
  role,
  isEmailVerified,
  firstName: profile.firstName,
  lastName: profile.lastName,
  bloodType: bloodTypeToDisplay(profile.bloodType),
  phone: profile.phone,
  city: profile.city ?? undefined,
  state: profile.state ?? undefined,
  province: profile.province ?? undefined,
  district: profile.district ?? undefined,
  municipality: profile.municipality ?? undefined,
  address: profile.address ?? undefined,
  gender: profile.gender ?? undefined,
  availability: profile.availableToDonate ? 'Available' : 'Unavailable',
});

// ─── Business Logic ───────────────────────────────────────────────────────────

/**
 * Registers a new user and their corresponding profile in a single transaction.
 *
 * Handles two donor registration shapes:
 *  - Simple  (Login.tsx): { firstName, lastName, bloodType, phone, city, state }
 *  - Full (DonorRegistration.tsx): { fullName, bloodGroup, province, district,
 *                                    municipality, address, gender, health,
 *                                    availability, emergencyContact }
 */
export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  // 1. Email uniqueness check (also enforced by DB unique constraint)
  const existingUser = await prisma.user.findUnique({ where: { email: data.email } });
  if (existingUser) {
    throw AppError.conflict('A user with this email address already exists');
  }

  // 2. Hash password
  const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_SALT_ROUNDS);

  // 3. Transactional create
  const { user, donorProfile } = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: { email: data.email, passwordHash, role: data.role },
    });

    let createdDonorProfile: DonorProfile | null = null;

    if (data.role === Role.DONOR) {
      // ── Determine name fields ────────────────────────────────────────────
      // Full form sends `fullName`; simple form sends `firstName`/`lastName`.
      let firstName: string;
      let lastName: string;

      if ('fullName' in data && data.fullName) {
        const parts = data.fullName.trim().split(/\s+/);
        firstName = parts[0] ?? data.fullName;
        lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
      } else {
        firstName = ('firstName' in data ? data.firstName : '') ?? '';
        lastName = ('lastName' in data ? data.lastName : '') ?? '';
      }

      // ── Determine blood type ─────────────────────────────────────────────
      // Full form sends `bloodGroup` (already transformed to BloodType by Zod).
      // Simple form sends `bloodType` (also transformed).
      const resolvedBloodType =
        ('bloodGroup' in data ? data.bloodGroup : undefined) ??
        ('bloodType' in data ? data.bloodType : undefined);

      if (!resolvedBloodType) {
        throw AppError.badRequest('Blood type is required for donor registration');
      }

      // ── Determine location fields ────────────────────────────────────────
      // Full form has province/district/municipality/address.
      // Simple form has city/state.
      const province = ('province' in data ? data.province : undefined) ?? undefined;
      const district = ('district' in data ? data.district : undefined) ?? undefined;
      const municipality = ('municipality' in data ? data.municipality : undefined) ?? undefined;
      const address = ('address' in data ? data.address : undefined) ?? undefined;
      // Map to legacy city/state for donor search compatibility
      const city = ('city' in data ? data.city : undefined) ?? district ?? '';
      const state = ('state' in data ? data.state : undefined) ?? province ?? '';

      // ── Health fields ────────────────────────────────────────────────────
      const health = 'health' in data ? data.health : undefined;
      const availability = 'availability' in data ? data.availability : undefined;
      const emergencyContact = 'emergencyContact' in data ? data.emergencyContact : undefined;

      createdDonorProfile = await tx.donorProfile.create({
        data: {
          userId: createdUser.id,
          firstName,
          lastName,
          bloodType: resolvedBloodType,
          dateOfBirth: 'dateOfBirth' in data && data.dateOfBirth
            ? (data.dateOfBirth instanceof Date ? data.dateOfBirth : new Date(data.dateOfBirth as string))
            : new Date('2000-01-01'),
          phone: data.phone,
          gender: ('gender' in data ? data.gender : undefined) ?? undefined,

          // Location
          province,
          district,
          municipality,
          address,
          city,
          state,

          // Health
          weight: health?.weight ?? undefined,
          lastDonationDate: health?.lastDonationDate ?? undefined,
          donatedBefore: health?.donatedBefore ?? false,
          currentlyHealthy: health?.currentlyHealthy ?? true,
          onMedication: health?.onMedication ?? false,
          medicalConditions: health?.medicalConditions ?? undefined,

          // Availability
          availableToDonate: availability?.availableToDonate ?? true,
          preferredContactMethod: availability?.preferredContactMethod ?? 'phone',

          // Emergency contact
          emergencyContactName: emergencyContact?.name ?? undefined,
          emergencyContactRelationship: emergencyContact?.relationship ?? undefined,
          emergencyContactPhone: emergencyContact?.phone ?? undefined,
        },
      });
    } else if (data.role === Role.HOSPITAL) {
      await tx.hospitalProfile.create({
        data: {
          userId: createdUser.id,
          name: data.name,
          licenseNumber: data.licenseNumber,
          address: data.address,
          contactPerson: data.contactPerson,
          phone: data.phone,
        },
      });
    } else if (data.role === Role.BLOOD_BANK) {
      await tx.bloodBankProfile.create({
        data: {
          userId: createdUser.id,
          name: data.name,
          licenseNumber: data.licenseNumber,
          address: data.address,
          contactPerson: data.contactPerson,
          phone: data.phone,
        },
      });
    }

    return { user: createdUser, donorProfile: createdDonorProfile };
  });

  // 4. Generate tokens
  const tokens = generateTokens({ userId: user.id, role: user.role, email: user.email });

  // 5. Build the enriched user payload
  let userPayload: AuthUserPayload;

  if (user.role === Role.DONOR && donorProfile) {
    userPayload = buildDonorUserPayload(
      user.id, user.email, user.role, user.isEmailVerified, donorProfile,
    );
  } else {
    // For Hospital / Blood Bank, fetch the name from the profile
    const hospitalProfile = user.role === Role.HOSPITAL
      ? await prisma.hospitalProfile.findUnique({ where: { userId: user.id } })
      : null;
    const bloodBankProfile = user.role === Role.BLOOD_BANK
      ? await prisma.bloodBankProfile.findUnique({ where: { userId: user.id } })
      : null;

    userPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      name: hospitalProfile?.name ?? bloodBankProfile?.name,
    };
  }

  return { ...tokens, user: userPayload };
};

/**
 * Authenticates a user and returns tokens + enriched profile.
 */
export const login = async (data: LoginRequest): Promise<AuthResponse> => {
  const user = await prisma.user.findFirst({
    where: { email: data.email, isActive: true },
  });

  if (!user) throw AppError.unauthorized('Invalid email or password');

  const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
  if (!isPasswordValid) throw AppError.unauthorized('Invalid email or password');

  const tokens = generateTokens({ userId: user.id, role: user.role, email: user.email });

  // Fetch the role-specific profile to enrich the response
  let userPayload: AuthUserPayload;

  if (user.role === Role.DONOR) {
    const donorProfile = await prisma.donorProfile.findUnique({ where: { userId: user.id } });
    if (donorProfile) {
      userPayload = buildDonorUserPayload(
        user.id, user.email, user.role, user.isEmailVerified, donorProfile,
      );
    } else {
      userPayload = { id: user.id, email: user.email, role: user.role, isEmailVerified: user.isEmailVerified };
    }
  } else if (user.role === Role.HOSPITAL) {
    const profile = await prisma.hospitalProfile.findUnique({ where: { userId: user.id } });
    userPayload = {
      id: user.id, email: user.email, role: user.role,
      isEmailVerified: user.isEmailVerified,
      name: profile?.name,
      phone: profile?.phone,
      address: profile?.address,
    };
  } else if (user.role === Role.BLOOD_BANK) {
    const profile = await prisma.bloodBankProfile.findUnique({ where: { userId: user.id } });
    userPayload = {
      id: user.id, email: user.email, role: user.role,
      isEmailVerified: user.isEmailVerified,
      name: profile?.name,
      phone: profile?.phone,
    };
  } else {
    // ADMIN — no extra profile
    userPayload = { id: user.id, email: user.email, role: user.role, isEmailVerified: user.isEmailVerified };
  }

  return { ...tokens, user: userPayload };
};

/**
 * Validates a refresh token and issues a fresh set of tokens.
 */
export const refreshTokens = async (refreshToken: string): Promise<AuthTokens> => {
  try {
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;

    const user = await prisma.user.findFirst({
      where: { id: decoded.userId, isActive: true },
    });

    if (!user) throw AppError.unauthorized('User no longer exists or has been disabled');

    return generateTokens({ userId: user.id, role: user.role, email: user.email });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
};
