/**
 * @file auth.validators.ts
 * @description Zod schemas for authentication request validation.
 */

import { z } from 'zod';
import { Role, BloodType } from '@prisma/client';

// ─── Shared Schemas ───────────────────────────────────────────────────────────

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(64, 'Password is too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// ─── Login Validator ──────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

// ─── Registration Validators ──────────────────────────────────────────────────

// Common fields required for all registrations
const baseRegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
});

// Profile fields for a Donor
const donorProfileSchema = z.object({
  role: z.literal(Role.DONOR),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  bloodType: z.nativeEnum(BloodType, { errorMap: () => ({ message: 'Invalid blood type' }) }),
  // Dates coming from JSON are strings; Zod can transform them to Date objects
  dateOfBirth: z.string().pipe(z.coerce.date()),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
});

// Profile fields for a Hospital
const hospitalProfileSchema = z.object({
  role: z.literal(Role.HOSPITAL),
  name: z.string().min(3, 'Hospital name must be at least 3 characters'),
  licenseNumber: z.string().min(5, 'Valid license number is required'),
  address: z.string().min(10, 'Full address is required'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
});

// Profile fields for a Blood Bank
const bloodBankProfileSchema = z.object({
  role: z.literal(Role.BLOOD_BANK),
  name: z.string().min(3, 'Blood Bank name must be at least 3 characters'),
  licenseNumber: z.string().min(5, 'Valid license number is required'),
  address: z.string().min(10, 'Full address is required'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
});

/**
 * The unified registration schema.
 * We use Zod's `discriminatedUnion` on the `role` field. This means:
 * - If `role` is "DONOR", Zod strictly validates against `donorProfileSchema`.
 * - If `role` is "HOSPITAL", it uses `hospitalProfileSchema`.
 * - Admins cannot be registered via this public endpoint.
 */
export const registerSchema = z.discriminatedUnion('role', [
  baseRegisterSchema.merge(donorProfileSchema),
  baseRegisterSchema.merge(hospitalProfileSchema),
  baseRegisterSchema.merge(bloodBankProfileSchema),
]);

export type RegisterRequest = z.infer<typeof registerSchema>;

// ─── Token Validators ─────────────────────────────────────────────────────────

export const refreshTokenSchema = z.object({
  // Typically sent via a secure HTTP-only cookie, but we allow it in body as a fallback/alternative
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
