import request from 'supertest';
import { createTestApp, TestContext } from './helpers/test-app';

const VALID_EMAIL = 'user@example.com';
const VALID_PASS = 'Password123';

describe('AuthModule (e2e)', () => {
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

  // ── Response shape ─────────────────────────────────────────────────────────

  describe('response format', () => {
    it('wraps errors in { success: false, error, meta }', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'no@example.com', password: 'pass1234' })
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toHaveProperty('code');
      expect(res.body.error).toHaveProperty('message');
      expect(res.body.meta.timestamp).toBeDefined();
    });
  });

  // ── Input validation ───────────────────────────────────────────────────────

  describe('validation', () => {
    it('POST /auth/register → 400 on invalid email', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'Password123' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('POST /auth/register → 400 when password is too short', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /auth/login → 400 on missing fields', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /auth/register → 400 on extra unknown fields', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS, role: 'admin' })
        .expect(400);
    });
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('creates user and sends verification email', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('verify');
      expect(ctx.mailService.sendVerifyEmail).toHaveBeenCalledWith(
        VALID_EMAIL,
        expect.any(String),
        'en',
      );
    });

    it('sends ru email when Accept-Language: ru', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .set('Accept-Language', 'ru')
        .send({ email: 'ru@example.com', password: VALID_PASS })
        .expect(201);

      expect(ctx.mailService.sendVerifyEmail).toHaveBeenCalledWith(
        'ru@example.com',
        expect.any(String),
        'ru',
      );
    });

    it('returns 409 on duplicate email', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS });

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS })
        .expect(409);

      expect(res.body.success).toBe(false);
    });
  });

  // ── verify-email ───────────────────────────────────────────────────────────

  describe('POST /auth/verify-email', () => {
    it('verifies email with valid token', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS });

      const rawToken = (ctx.mailService.sendVerifyEmail.mock.calls[0] as string[])[1];

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: rawToken })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain('verified');
    });

    it('returns 400 for invalid token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: 'bad-token' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    async function registerAndVerify() {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS });

      const rawToken = (ctx.mailService.sendVerifyEmail.mock.calls[0] as string[])[1];
      await request(ctx.app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: rawToken });
    }

    it('returns token pair for verified user', async () => {
      await registerAndVerify();

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: VALID_EMAIL, password: VALID_PASS })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
    });

    it('returns 401 for wrong password', async () => {
      await registerAndVerify();

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: VALID_EMAIL, password: 'wrongpass' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('returns 401 for unknown email', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'ghost@example.com', password: VALID_PASS })
        .expect(401);
    });

    it('returns 403 when email not verified', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS });

      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: VALID_EMAIL, password: VALID_PASS })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  // ── Full auth flow: register → verify → login → refresh → logout ──────────

  it('Full auth flow: register → verify → login → refresh → logout → 401', async () => {
    // 1. Register
    const regRes = await request(ctx.app.getHttpServer())
      .post('/auth/register')
      .send({ email: VALID_EMAIL, password: VALID_PASS })
      .expect(201);
    expect(regRes.body.success).toBe(true);

    // 2. Verify email
    const verifyToken = (ctx.mailService.sendVerifyEmail.mock.calls[0] as string[])[1];
    await request(ctx.app.getHttpServer())
      .post('/auth/verify-email')
      .send({ token: verifyToken })
      .expect(200);

    // 3. Login
    const loginRes = await request(ctx.app.getHttpServer())
      .post('/auth/login')
      .send({ email: VALID_EMAIL, password: VALID_PASS })
      .expect(200);
    const accessToken: string = loginRes.body.data.accessToken;
    let refreshToken: string = loginRes.body.data.refreshToken;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();

    // 4. Refresh → new token pair, old token consumed
    const refreshRes = await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    refreshToken = refreshRes.body.data.refreshToken;

    // 5. Logout
    await request(ctx.app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    // 6. Consumed refresh token → 401
    await request(ctx.app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  // ── forgot-password / reset-password flow ─────────────────────────────────

  describe('forgot-password → reset-password flow', () => {
    it('returns safe message for unknown email', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: 'nobody@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(ctx.mailService.sendResetPassword).not.toHaveBeenCalled();
    });

    it('full flow: forgot → reset → login with new password', async () => {
      // Register & verify
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS });
      const verifyToken = (ctx.mailService.sendVerifyEmail.mock.calls[0] as string[])[1];
      await request(ctx.app.getHttpServer())
        .post('/auth/verify-email')
        .send({ token: verifyToken });

      // Forgot password
      await request(ctx.app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: VALID_EMAIL })
        .expect(200);

      expect(ctx.mailService.sendResetPassword).toHaveBeenCalled();
      const resetToken = (ctx.mailService.sendResetPassword.mock.calls[0] as string[])[1];

      // Reset password
      const NEW_PASS = 'NewPassword456';
      await request(ctx.app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: NEW_PASS })
        .expect(200);

      // Login with new password
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/login')
        .send({ email: VALID_EMAIL, password: NEW_PASS })
        .expect(200);

      expect(res.body.data.accessToken).toBeDefined();
    });

    it('reset-password → 400 for already used token', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS });
      await request(ctx.app.getHttpServer())
        .post('/auth/forgot-password')
        .send({ email: VALID_EMAIL });

      const resetToken = (ctx.mailService.sendResetPassword.mock.calls[0] as string[])[1];

      await request(ctx.app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'NewPassword456' });

      // Reuse same token
      await request(ctx.app.getHttpServer())
        .post('/auth/reset-password')
        .send({ token: resetToken, newPassword: 'AnotherPassword789' })
        .expect(400);
    });
  });

  // ── resend-verify ──────────────────────────────────────────────────────────

  describe('POST /auth/resend-verify', () => {
    it('sends new verification email for unverified user', async () => {
      await request(ctx.app.getHttpServer())
        .post('/auth/register')
        .send({ email: VALID_EMAIL, password: VALID_PASS });

      jest.clearAllMocks();

      await request(ctx.app.getHttpServer())
        .post('/auth/resend-verify')
        .send({ email: VALID_EMAIL })
        .expect(200);

      expect(ctx.mailService.sendVerifyEmail).toHaveBeenCalled();
    });

    it('returns safe message for unknown email (no leak)', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/auth/resend-verify')
        .send({ email: 'ghost@example.com' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(ctx.mailService.sendVerifyEmail).not.toHaveBeenCalled();
    });
  });

  // ── JWT guard ──────────────────────────────────────────────────────────────

  describe('JWT guard', () => {
    it('GET /users/me → 401 without token', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/users/me')
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('GET /users/me → 401 with malformed token', async () => {
      await request(ctx.app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer not.a.jwt')
        .expect(401);
    });
  });
});
