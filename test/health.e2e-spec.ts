import request from 'supertest';
import { createTestApp, TestContext } from './helpers/test-app';

describe('HealthModule (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /health → 200 with correct shape', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/health').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      db: 'up',
    });
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.body.meta.timestamp).toBeDefined();
  });

  it('GET /health does not require authentication', async () => {
    await request(ctx.app.getHttpServer())
      .get('/health')
      .expect(200);
  });
});
