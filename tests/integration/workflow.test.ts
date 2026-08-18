/**
 * @file workflow.test.ts
 * @description Integration tests for LifeLink workflow matching engine, notifications, and appointments.
 */

import request from 'supertest';
import app from '@/app';
import { prisma, disconnectDatabase } from '@config/database';
import {
  Role,
  BloodType,
  RequestUrgency,
  RequestStatus,
  AppointmentStatus,
  VerificationStatus,
} from '@prisma/client';
import { HttpStatus } from '@constants/http.constants';

describe('LifeLink Workflow Integration', () => {
  let donorToken: string;
  let hospitalToken: string;
  let bankToken: string;

  let donorId: string;
  let bankId: string;

  beforeAll(async () => {
    // Clear only test users to protect developer/seeding accounts
    await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: '@test.lifelink.app',
        },
      },
    });

    // 1. Register Donor
    const donorRes = await request(app).post('/api/v1/auth/register').send({
      email: 'donor@test.lifelink.app',
      password: 'Password123',
      role: Role.DONOR,
      firstName: 'Dave',
      lastName: 'Donor',
      bloodType: BloodType.O_NEG,
      dateOfBirth: '1995-05-05',
      phone: '9841000000',
      city: 'Kathmandu',
      state: 'Bagmati',
    });
    donorToken = donorRes.body.data.accessToken;
    donorId = donorRes.body.data.user.id;

    // 2. Register Hospital
    const hospRes = await request(app).post('/api/v1/auth/register').send({
      email: 'hosp@test.lifelink.app',
      password: 'Password123',
      role: Role.HOSPITAL,
      name: 'Kathmandu General',
      licenseNumber: 'HOSP-12345',
      address: 'Kalimati, Kathmandu',
      contactPerson: 'Dr. Sita',
      phone: '014400000',
    });
    const hospitalUserId = hospRes.body.data.user.id as string;

    // 3. Register Blood Bank
    const bankRes = await request(app).post('/api/v1/auth/register').send({
      email: 'bank@test.lifelink.app',
      password: 'Password123',
      role: Role.BLOOD_BANK,
      name: 'Central Blood Bank',
      licenseNumber: 'BANK-54321',
      address: 'Red Cross Marg',
      contactPerson: 'Ram Bahadur',
      phone: '015500000',
    });
    const bankUserId = bankRes.body.data.user.id as string;

    // Workflow tests exercise approved organization behavior. Registration
    // intentionally leaves organizations pending, so approve the fixtures and
    // log in again to issue tokens containing the current verification status.
    await prisma.user.updateMany({
      where: { id: { in: [hospitalUserId, bankUserId] } },
      data: { verificationStatus: VerificationStatus.APPROVED },
    });

    const [hospitalLogin, bankLogin] = await Promise.all([
      request(app).post('/api/v1/auth/login').send({
        email: 'hosp@test.lifelink.app',
        password: 'Password123',
      }),
      request(app).post('/api/v1/auth/login').send({
        email: 'bank@test.lifelink.app',
        password: 'Password123',
      }),
    ]);
    hospitalToken = hospitalLogin.body.data.accessToken;
    bankToken = bankLogin.body.data.accessToken;

    // Resolve profile IDs
    const donorProfile = await prisma.donorProfile.findUnique({ where: { userId: donorId } });
    if (donorProfile) {
      donorId = donorProfile.id;
    }

    const bankProfile = await prisma.bloodBankProfile.findUnique({ where: { userId: bankUserId } });
    if (bankProfile) {
      bankId = bankProfile.id;
    }
  });

  afterAll(async () => {
    // Clear only test users to protect developer/seeding accounts
    await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: '@test.lifelink.app',
        },
      },
    });
    await disconnectDatabase();
  });

  describe('Path B — Direct Donor Match', () => {
    let requestId: string;

    it('should create request as PENDING when no inventory is available, and alert matching donor', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      const res = await request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          patientName: 'Ram Shrestha',
          bloodType: 'O-',
          unitsRequired: 2,
          urgency: RequestUrgency.URGENT,
          requiredByDate: tomorrow.toISOString(),
          notes: 'Emergency operation',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data.status).toBe(RequestStatus.PENDING);
      requestId = res.body.data.id;

      // Verify the donor received a notification
      const donorUser = await prisma.donorProfile.findUnique({
        where: { id: donorId },
        include: { user: true },
      });

      expect(donorUser).toBeDefined();
      const alerts = await prisma.notification.findMany({
        where: { userId: donorUser?.userId, type: 'REQUEST_ALERT' },
      });
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should allow donor to accept the request directly', async () => {
      const res = await request(app)
        .post(`/api/v1/blood-requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${donorToken}`)
        .expect(HttpStatus.OK);

      expect(res.body.data.status).toBe(RequestStatus.MATCHED_DONOR);
      expect(res.body.data.matchedDonorId).toBe(donorId);
    });

    it('should reject another accept attempt on the same request (race condition)', async () => {
      await request(app)
        .post(`/api/v1/blood-requests/${requestId}/accept`)
        .set('Authorization', `Bearer ${donorToken}`)
        .expect(HttpStatus.CONFLICT);
    });

    it('should reject reversing a matched request to an arbitrary status', async () => {
      await request(app)
        .patch(`/api/v1/blood-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ status: RequestStatus.PENDING })
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('Authorization boundaries', () => {
    it('should deny hospitals access to the appointment list', async () => {
      await request(app)
        .get('/api/v1/appointments')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  describe('Donation Appointments', () => {
    let appointmentId: string;
    let requestForApptId: string;

    beforeAll(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      // Create another request that donor accepts
      const reqRes = await request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          patientName: 'Shyam Karki',
          bloodType: 'O-',
          unitsRequired: 1,
          requiredByDate: tomorrow.toISOString(),
        });
      requestForApptId = reqRes.body.data.id;

      await request(app)
        .post(`/api/v1/blood-requests/${requestForApptId}/accept`)
        .set('Authorization', `Bearer ${donorToken}`);
    });

    it('should allow donor to book an appointment linked to the accepted request', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 3);

      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          bloodBankId: bankId,
          bloodRequestId: requestForApptId,
          appointmentDate: tomorrow.toISOString().split('T')[0],
          slot: '11:00',
        })
        .expect(HttpStatus.CREATED);

      expect(res.body.data.status).toBe(AppointmentStatus.PENDING);
      appointmentId = res.body.data.id;
    });

    it("should reject linking another donor's matched request", async () => {
      const secondDonorRes = await request(app).post('/api/v1/auth/register').send({
        email: 'second-donor@test.lifelink.app',
        password: 'Password123',
        role: Role.DONOR,
        firstName: 'Second',
        lastName: 'Donor',
        bloodType: BloodType.O_NEG,
        dateOfBirth: '1996-06-06',
        phone: '9841000001',
        city: 'Kathmandu',
        state: 'Bagmati',
      });
      const secondDonorToken = secondDonorRes.body.data.accessToken as string;

      await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${secondDonorToken}`)
        .send({
          bloodBankId: bankId,
          bloodRequestId: requestForApptId,
          appointmentDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          slot: '14:00',
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('should reject linking a request that does not exist', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 4);

      await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${donorToken}`)
        .send({
          bloodBankId: bankId,
          bloodRequestId: '00000000-0000-0000-0000-000000000000',
          appointmentDate: tomorrow.toISOString().split('T')[0],
          slot: '14:00',
        })
        .expect(HttpStatus.NOT_FOUND);
    });

    it('should allow blood bank to mark the appointment as COMPLETED and automatically fulfill the request and increase inventory', async () => {
      await request(app)
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${bankToken}`)
        .send({ status: AppointmentStatus.CONFIRMED })
        .expect(HttpStatus.OK);

      const res = await request(app)
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${bankToken}`)
        .send({ status: AppointmentStatus.COMPLETED })
        .expect(HttpStatus.OK);

      expect(res.body.data.status).toBe(AppointmentStatus.COMPLETED);

      const reqObj = await prisma.bloodRequest.findUnique({ where: { id: requestForApptId } });
      expect(reqObj).toBeDefined();
      expect(reqObj?.status).toBe(RequestStatus.FULFILLED);

      // 2. Verify blood bank inventory has increased by 1 unit for O_NEG
      const inv = await prisma.bloodInventory.findUnique({
        where: {
          bloodBankId_bloodType: {
            bloodBankId: bankId,
            bloodType: BloodType.O_NEG,
          },
        },
      });
      expect(inv).toBeDefined();
      expect(inv?.unitsAvailable).toBe(1);
    });

    it('should reject completing an already completed appointment', async () => {
      await request(app)
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${bankToken}`)
        .send({ status: AppointmentStatus.COMPLETED })
        .expect(HttpStatus.CONFLICT);

      const inv = await prisma.bloodInventory.findUnique({
        where: {
          bloodBankId_bloodType: {
            bloodBankId: bankId,
            bloodType: BloodType.O_NEG,
          },
        },
      });
      expect(inv?.unitsAvailable).toBe(1);
    });
  });

  describe('Path A — Automatic Inventory Match', () => {
    it('should automatically match a new request with inventory if matching stock exists', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);

      // We have 1 unit of O- in stock at central blood bank from the previous completed donation.
      // Let's request 1 unit of O-.
      const res = await request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          patientName: 'Gita Thapa',
          bloodType: 'O-',
          unitsRequired: 1,
          urgency: RequestUrgency.NORMAL,
          requiredByDate: tomorrow.toISOString(),
        })
        .expect(HttpStatus.CREATED);

      // Should match automatically!
      expect(res.body.data.status).toBe(RequestStatus.MATCHED_INVENTORY);
      expect(res.body.data.matchedBloodBankId).toBe(bankId);
      const matchedRequestId = res.body.data.id as string;

      const rejectRes = await request(app)
        .post(`/api/v1/blood-requests/${matchedRequestId}/reject-inventory`)
        .set('Authorization', `Bearer ${bankToken}`)
        .expect(HttpStatus.OK);

      expect(rejectRes.body.data.status).toBe(RequestStatus.PENDING);
      expect(rejectRes.body.data.matchedBloodBankId).toBeNull();

      const inventory = await prisma.bloodInventory.findUnique({
        where: {
          bloodBankId_bloodType: {
            bloodBankId: bankId,
            bloodType: BloodType.O_NEG,
          },
        },
      });
      expect(inventory?.unitsReserved).toBe(0);

      const donorRequests = await request(app)
        .get('/api/v1/blood-requests?bloodType=O_NEG&status=PENDING')
        .set('Authorization', `Bearer ${donorToken}`)
        .expect(HttpStatus.OK);

      expect(donorRequests.body.data.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: matchedRequestId })]),
      );
    });
  });
});
