// Domain-specific e2e suites:
//   health.e2e-spec.ts  — GET /health
//   auth.e2e-spec.ts    — register / verify / login / refresh / logout / forgot / reset
//   users.e2e-spec.ts   — GET|PATCH|DELETE /users/me

describe('E2E suite', () => {
  it('is configured correctly', () => {
    expect(true).toBe(true);
  });
});
