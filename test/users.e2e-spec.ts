import request from 'supertest';
import { createTestApp, TestContext } from './helpers/test-app';

const EMAIL = 'user@example.com';
const PASS = 'Password123';

async function registerVerifyLogin(ctx: TestContext): Promise<{ accessToken: string; refreshToken: string }> {
  await request(ctx.app.getHttpServer())
    .post('/auth/register')
    .send({ email: EMAIL, password: PASS });

  const rawToken = (ctx.mailService.sendVerifyEmail.mock.calls[0] as string[])[1];
  await request(ctx.app.getHttpServer())
    .post('/auth/verify-email')
    .send({ token: rawToken });

  const res = await request(ctx.app.getHttpServer())
    .post('/auth/login')
    .send({ email: EMAIL, password: PASS });

  return res.body.data;
}

describe('UsersModule (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    ctx.prisma.reset();
    jest.clearAllMocks();
  });

  // ── GET /users/me ──────────────────────────────────────────────────────────

  describe('GET /users/me', () => {
    it('returns user profile with stats', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      const res = await request(ctx.app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        email: EMAIL,
        isEmailVerified: true,
        level: 'BEGINNER',
        preferredCategories: [],
        stats: {
          totalCompleted: 0,
          currentStreak: 0,
          badgesEarned: 0,
        },
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
      // passwordHash must never be exposed
      expect(res.body.data.passwordHash).toBeUndefined();
    });
  });

  // ── PATCH /users/me ────────────────────────────────────────────────────────

  describe('PATCH /users/me', () => {
    it('updates level and locale', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      const res = await request(ctx.app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ level: 'PRO', locale: 'RU' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.level).toBe('PRO');
      expect(res.body.data.locale).toBe('RU');
    });

    it('updates preferredCategories', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      const res = await request(ctx.app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ preferredCategories: ['VISUAL', 'SOCIAL'] })
        .expect(200);

      expect(res.body.data.preferredCategories).toEqual(['VISUAL', 'SOCIAL']);
    });

    it('returns 400 for invalid level enum value', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      const res = await request(ctx.app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ level: 'EXPERT' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when preferredCategories is empty array', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      await request(ctx.app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ preferredCategories: [] })
        .expect(400);
    });

    it('returns 401 without token', async () => {
      await request(ctx.app.getHttpServer())
        .patch('/users/me')
        .send({ level: 'PRO' })
        .expect(401);
    });
  });

  // ── PATCH /users/me/password ───────────────────────────────────────────────

  describe('PATCH /users/me/password', () => {
    it('changes password successfully', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      await request(ctx.app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: PASS, newPassword: 'NewPass456!' })
        .expect(204);
    });

    it('returns 401 for wrong current password', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      const res = await request(ctx.app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: 'WrongPass!', newPassword: 'NewPass456!' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('returns 400 when new password is too short', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      await request(ctx.app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: PASS, newPassword: 'short' })
        .expect(400);
    });

    it('after password change, old refresh tokens are invalidated', async () => {
      const { accessToken, refreshToken } = await registerVerifyLogin(ctx);

      await request(ctx.app.getHttpServer())
        .patch('/users/me/password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: PASS, newPassword: 'NewPass456!' })
        .expect(204);

      // Old refresh token should no longer work
      await request(ctx.app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });
  });

  // ── DELETE /users/me ───────────────────────────────────────────────────────

  describe('DELETE /users/me', () => {
    it('deletes account successfully', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      await request(ctx.app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('after deletion, user cannot log in', async () => {
      const { accessToken } = await registerVerifyLogin(ctx);

      await request(ctx.app.getHttpServer())
        .delete('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: EMAIL, password: PASS })
        .expect(401);
    });
  });
});
