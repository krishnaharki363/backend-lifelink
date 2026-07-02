/**
 * @file auth.test.ts
 * @description Integration tests for authentication endpoints using Supertest.
 *
 * These tests hit the real Express app (bypassing network ports) and the real
 * development database. They verify the complete request lifecycle:
 * Route -> Zod Validation -> Controller -> Service -> Database -> Response.
 */

import request from 'supertest';
import app from '@/app';
import { prisma, disconnectDatabase } from '@config/database';
import { Role, BloodType } from '@prisma/client';
import { HttpStatus } from '@constants/http.constants';
import { ErrorCode } from '@interfaces/error.interface';

// ─── Test Lifecycle ───────────────────────────────────────────────────────────

beforeAll(async () => {
  // Clear the database before running tests to ensure a clean slate
  await prisma.donorProfile.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  // Clear data created during tests
  await prisma.donorProfile.deleteMany();
  await prisma.user.deleteMany();
  // Close the Prisma connection pool cleanly
  await disconnectDatabase();
});

// ─── Test Data ────────────────────────────────────────────────────────────────

const mockDonor = {
  email: 'testdonor@lifelink.app',
  password: 'SecurePassword123',
  role: Role.DONOR,
  firstName: 'John',
  lastName: 'Doe',
  bloodType: BloodType.O_POS,
  dateOfBirth: '1990-01-01',
  phone: '1234567890',
  city: 'Metropolis',
  state: 'NY',
};

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('Authentication Endpoints', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should successfully register a new donor', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(mockDonor)
        .expect(HttpStatus.CREATED);

      // Verify response envelope
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Registration successful');
      
      // Verify data payload
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data.user.email).toBe(mockDonor.email);
      expect(response.body.data.user.role).toBe(Role.DONOR);

      // Verify HTTP-only refresh token cookie was set
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('refreshToken='))).toBe(true);
      expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    });

    it('should reject registration with an existing email (409 Conflict)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(mockDonor)
        .expect(HttpStatus.CONFLICT);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe(ErrorCode.ALREADY_EXISTS);
    });

    it('should reject registration with missing fields (422 Unprocessable Entity)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid@lifelink.app',
          // Missing password, role, and profile fields
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should successfully login with correct credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: mockDonor.email,
          password: mockDonor.password,
        })
        .expect(HttpStatus.OK);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data.user.email).toBe(mockDonor.email);

      // Verify refresh token cookie
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('refreshToken='))).toBe(true);
    });

    it('should reject login with incorrect password (401 Unauthorized)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: mockDonor.email,
          password: 'WrongPassword456',
        })
        .expect(HttpStatus.UNAUTHORIZED);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should clear the refresh token cookie', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(HttpStatus.OK);

      expect(response.body.success).toBe(true);
      
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('refreshToken=;'))).toBe(true);
    });
  });
});
