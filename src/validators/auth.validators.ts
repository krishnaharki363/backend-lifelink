/**
 * @file auth.validators.ts
 * @description Zod schemas for authentication request validation.
 *
 * DONOR REGISTRATION — TWO PATHS:
 *
 * 1. Login.tsx "Register" tab (simple):
 *    Sends: { firstName, lastName, email, password, role, bloodType, phone, city, state }
 *
 * 2. DonorRegistration.tsx (full multi-step form):
 *    Sends: { fullName, dateOfBirth, gender, bloodGroup, phone, email?, province, district,
 *             municipality, address, password, role: "DONOR",
 *             health: { weight, lastDonationDate?, donatedBefore, currentlyHealthy,
 *                       onMedication, medicalConditions? },
 *             availability: { availableToDonate, preferredContactMethod },
 *             emergencyContact?: { name, relationship, phone } }
 *
 * We accept BOTH shapes via a discriminated union on the `role` field.
 * The `donorProfileSchema` uses `.or()` so either set of fields is valid.
 */

import { z } from 'zod';
import { Role } from '@prisma/client';
import { bloodTypeSchema } from './common';

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

const baseRegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
});

// ── Nested sub-schemas for the full DonorRegistration form ───────────────────

const healthSchema = z
  .object({
    weight: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => (v !== undefined && v !== '' ? parseFloat(String(v)) : undefined)),
    lastDonationDate: z
      .string()
      .nullable()
      .optional()
      .transform((v) => (v ? new Date(v) : null)),
    donatedBefore: z.boolean().optional().default(false),
    currentlyHealthy: z.boolean().optional().default(true),
    onMedication: z.boolean().optional().default(false),
    medicalConditions: z.string().nullable().optional(),
  })
  .optional();

const availabilitySchema = z
  .object({
    availableToDonate: z.boolean().optional().default(true),
    preferredContactMethod: z.string().optional().default('phone'),
  })
  .optional();

const emergencyContactSchema = z
  .object({
    name: z.string().min(1).optional(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
  })
  .nullable()
  .optional();

// ── Donor — simple path (Login.tsx register tab) ─────────────────────────────

const donorSimpleSchema = z.object({
  role: z.literal(Role.DONOR),
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  // Accept display format "A+" or Prisma format "A_POS" via bloodTypeSchema
  bloodType: bloodTypeSchema,
  dateOfBirth: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : new Date('2000-01-01'))),
  phone: z.string().min(7, 'Phone number must be at least 7 digits'),
  city: z.string().min(1).optional().default(''),
  state: z.string().min(1).optional().default(''),
  // Province/district/municipality not required on simple path
  province: z.string().optional(),
  district: z.string().optional(),
  municipality: z.string().optional(),
  address: z.string().optional(),
  gender: z.string().optional(),
  health: healthSchema,
  availability: availabilitySchema,
  emergencyContact: emergencyContactSchema,
});

// ── Donor — full path (DonorRegistration.tsx multi-step form) ─────────────────

const donorFullSchema = z.object({
  role: z.literal(Role.DONOR),
  // Full name — will be split into firstName / lastName in the service
  fullName: z.string().min(2, 'Full name is required'),
  // bloodGroup is the display-format field used by DonorRegistration.tsx
  bloodGroup: bloodTypeSchema,
  dateOfBirth: z.string().pipe(z.coerce.date()),
  gender: z.string().min(1, 'Gender is required'),
  phone: z.string().min(7, 'Phone number is required'),
  email: z.string().email('Invalid email address'),
  province: z.string().min(1, 'Province is required'),
  district: z.string().min(1, 'District is required'),
  municipality: z.string().min(1, 'Municipality is required'),
  address: z.string().min(2, 'Address is required'),
  health: healthSchema,
  availability: availabilitySchema,
  emergencyContact: emergencyContactSchema,
});

// ── Hospital profile ──────────────────────────────────────────────────────────

const hospitalProfileSchema = z.object({
  role: z.literal(Role.HOSPITAL),
  name: z.string().min(3, 'Hospital name must be at least 3 characters'),
  licenseNumber: z.string().min(5, 'Valid license number is required'),
  address: z.string().min(10, 'Full address is required'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z.string().min(7, 'Phone number is required'),
});

// ── Blood Bank profile ────────────────────────────────────────────────────────

const bloodBankProfileSchema = z.object({
  role: z.literal(Role.BLOOD_BANK),
  name: z.string().min(3, 'Blood Bank name must be at least 3 characters'),
  licenseNumber: z.string().min(5, 'Valid license number is required'),
  address: z.string().min(10, 'Full address is required'),
  contactPerson: z.string().min(2, 'Contact person is required'),
  phone: z.string().min(7, 'Phone number is required'),
});

/**
 * Unified registration schema.
 * Admins cannot register through the public API.
 */
export const registerSchema = z.union([
  baseRegisterSchema.merge(donorFullSchema),
  baseRegisterSchema.merge(donorSimpleSchema),
  baseRegisterSchema.merge(hospitalProfileSchema),
  baseRegisterSchema.merge(bloodBankProfileSchema),
]);

export type RegisterRequest = z.infer<typeof registerSchema>;

// ─── Token Validators ─────────────────────────────────────────────────────────

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;
