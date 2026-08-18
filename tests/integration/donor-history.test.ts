/**
 * Regression test for donor history isolation.
 * A donor must only see blood requests matched to that donor when requesting
 * their own donation history.
 */

import request from 'supertest';
import app from '@/app';
import { prisma, disconnectDatabase } from '@config/database';
import { BloodType, RequestStatus, Role, VerificationStatus } from '@prisma/client';
import { HttpStatus } from '@constants/http.constants';

describe('Donor history isolation', () => {
  let donorOneToken: string;
  let donorTwoToken: string;
  let hospitalToken: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@history-test.lifelink.app' } },
    });

    const [donorOne, donorTwo, hospital] = await Promise.all([
      request(app).post('/api/v1/auth/register').send({
        email: 'donor-one@history-test.lifelink.app',
        password: 'Password123',
        role: Role.DONOR,
        firstName: 'Donor',
        lastName: 'One',
        bloodType: BloodType.AB_NEG,
        dateOfBirth: '1995-05-05',
        phone: '9841000010',
        city: 'Kathmandu',
        state: 'Bagmati',
      }),
      request(app).post('/api/v1/auth/register').send({
        email: 'donor-two@history-test.lifelink.app',
        password: 'Password123',
        role: Role.DONOR,
        firstName: 'Donor',
        lastName: 'Two',
        bloodType: BloodType.AB_NEG,
        dateOfBirth: '1996-06-06',
        phone: '9841000011',
        city: 'Kathmandu',
        state: 'Bagmati',
      }),
      request(app).post('/api/v1/auth/register').send({
        email: 'history-hospital@history-test.lifelink.app',
        password: 'Password123',
        role: Role.HOSPITAL,
        name: 'History Test Hospital',
        licenseNumber: 'HISTORY-HOSPITAL-1',
        address: 'Kalimati, Kathmandu',
        contactPerson: 'History Test',
        phone: '0155000010',
      }),
    ]);

    expect(donorOne.status).toBe(HttpStatus.CREATED);
    expect(donorTwo.status).toBe(HttpStatus.CREATED);
    expect(hospital.status).toBe(HttpStatus.CREATED);

    const hospitalUserId = hospital.body.data.user.id as string;
    await prisma.user.update({
      where: { id: hospitalUserId },
      data: { verificationStatus: VerificationStatus.APPROVED },
    });

    const hospitalLogin = await request(app).post('/api/v1/auth/login').send({
      email: 'history-hospital@history-test.lifelink.app',
      password: 'Password123',
    });

    donorOneToken = donorOne.body.data.accessToken as string;
    donorTwoToken = donorTwo.body.data.accessToken as string;
    hospitalToken = hospitalLogin.body.data.accessToken as string;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: '@history-test.lifelink.app' } },
    });
    await disconnectDatabase();
  });

  it("returns only the authenticated donor's matched requests for own history", async () => {
    const requiredByDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const createRequest = (patientName: string): request.Test =>
      request(app)
        .post('/api/v1/blood-requests')
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({
          patientName,
          bloodType: BloodType.AB_NEG,
          unitsRequired: 1,
          requiredByDate,
        });

    const [requestOne, requestTwo] = await Promise.all([
      createRequest('Patient Matched To One'),
      createRequest('Patient Matched To Two'),
    ]);

    expect(requestOne.status).toBe(HttpStatus.CREATED);
    expect(requestTwo.status).toBe(HttpStatus.CREATED);
    expect(requestOne.body.data.status).toBe(RequestStatus.PENDING);
    expect(requestTwo.body.data.status).toBe(RequestStatus.PENDING);

    const requestOneId = requestOne.body.data.id as string;
    const requestTwoId = requestTwo.body.data.id as string;

    await request(app)
      .post(`/api/v1/blood-requests/${requestOneId}/accept`)
      .set('Authorization', `Bearer ${donorOneToken}`)
      .expect(HttpStatus.OK);
    await request(app)
      .post(`/api/v1/blood-requests/${requestTwoId}/accept`)
      .set('Authorization', `Bearer ${donorTwoToken}`)
      .expect(HttpStatus.OK);

    const history = await request(app)
      .get('/api/v1/blood-requests?mine=true&limit=100')
      .set('Authorization', `Bearer ${donorOneToken}`)
      .expect(HttpStatus.OK);

    expect(history.body.data.data).toEqual([
      expect.objectContaining({
        id: requestOneId,
        matchedDonorId: expect.any(String),
      }),
    ]);
    expect(history.body.data.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: requestTwoId })]),
    );
  });
});
