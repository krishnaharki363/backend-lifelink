import request from 'supertest';
import app from '@/app';

describe('POST /api/v1/auth/refresh', () => {
  it('accepts a refresh token supplied by cookie and reaches token verification', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', ['refreshToken=not-a-valid-token']);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid or expired refresh token');
  });

  it('accepts the backwards-compatible body transport', async () => {
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: 'not-a-valid-token' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid or expired refresh token');
  });

  it('returns unauthorized when no refresh token is supplied', async () => {
    const response = await request(app).post('/api/v1/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Refresh token is required');
  });
});
