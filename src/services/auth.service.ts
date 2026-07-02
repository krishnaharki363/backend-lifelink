/**
 * @file auth.service.ts
 * @description Business logic for authentication (Register, Login, Token generation).
 *
 * WHY A SEPARATE SERVICE LAYER?
 * Controllers should only handle HTTP concerns (req/res, status codes).
 * Services handle the actual business rules. This makes the logic:
 * - Reusable (you could call `authService.login()` from a CLI or webhook)
 * - Testable (you can test this without mocking Express req/res objects)
 */

import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { prisma } from '@config/database';
import { env } from '@config/env';
import { AppError } from '@utils/AppError';
import { Role } from '@prisma/client';
import type { RegisterRequest, LoginRequest } from '@validators/auth.validators';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shape of the payload encoded inside our JWT tokens.
 */
export interface JwtPayload {
  userId: string;
  role: Role;
  email: string;
}

/**
 * Return type for authentication methods.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: {
    id: string;
    email: string;
    role: Role;
    isEmailVerified: boolean;
  };
}

// ─── Token Utilities ──────────────────────────────────────────────────────────

/**
 * Generates an Access Token and a Refresh Token for a user.
 */
const generateTokens = (payload: JwtPayload): AuthTokens => {
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });

  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'],
  });

  return { accessToken, refreshToken };
};

// ─── Business Logic Methods ───────────────────────────────────────────────────

/**
 * Registers a new user and their corresponding profile in a single transaction.
 */
export const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  // 1. Verify email uniqueness
  // (Prisma would throw a P2002 error anyway, but doing it explicitly
  // lets us return a clearer error message before hashing the password).
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw AppError.conflict('A user with this email address already exists');
  }

  // 2. Hash the password securely
  const passwordHash = await bcrypt.hash(data.password, env.BCRYPT_SALT_ROUNDS);

  // 3. Create the user and their profile transactionally.
  // We use Prisma's nested writes to ensure both records are created,
  // or neither is created if something fails.
  const user = await prisma.$transaction(async (tx) => {
    // Create base user record
    const createdUser = await tx.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
      },
    });

    // Create the role-specific profile
    if (data.role === Role.DONOR) {
      await tx.donorProfile.create({
        data: {
          userId: createdUser.id,
          firstName: data.firstName,
          lastName: data.lastName,
          bloodType: data.bloodType,
          dateOfBirth: data.dateOfBirth,
          phone: data.phone,
          city: data.city,
          state: data.state,
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

    return createdUser;
  });

  // 4. Generate initial tokens (automatic login upon registration)
  const tokens = generateTokens({
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

/**
 * Authenticates a user by email and password, returning tokens.
 */
export const login = async (data: LoginRequest): Promise<AuthResponse> => {
  // 1. Find user (must be active — no soft-deleted users)
  const user = await prisma.user.findFirst({
    where: { email: data.email, isActive: true },
  });

  // Defensive: use a generic error message to avoid account enumeration
  if (!user) {
    throw AppError.unauthorized('Invalid email or password');
  }

  // 2. Verify password
  const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
  if (!isPasswordValid) {
    throw AppError.unauthorized('Invalid email or password');
  }

  // 3. Generate new tokens
  const tokens = generateTokens({
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  return {
    ...tokens,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    },
  };
};

/**
 * Validates a refresh token and issues a fresh set of tokens.
 */
export const refreshTokens = async (refreshToken: string): Promise<AuthTokens> => {
  try {
    // 1. Verify the token signature and expiration
    // This throws JsonWebTokenError or TokenExpiredError if invalid
    const decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as JwtPayload;

    // 2. Check if user still exists and is active
    // This is crucial: if a user is banned, their refresh token should stop working
    const user = await prisma.user.findFirst({
      where: { id: decoded.userId, isActive: true },
    });

    if (!user) {
      throw AppError.unauthorized('User no longer exists or has been disabled');
    }

    // 3. Issue new tokens
    return generateTokens({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
  } catch (error) {
    // If the error is already an AppError (from our user check above), rethrow it
    if (error instanceof AppError) throw error;
    
    // Otherwise, it's a JWT verification error.
    // We let the global error handler catch JsonWebTokenError naturally, 
    // but we can also explicitly throw an AppError here.
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
};
