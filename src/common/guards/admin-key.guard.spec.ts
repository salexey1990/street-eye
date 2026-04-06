import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminKeyGuard } from './admin-key.guard';

const mockConfigService = {
  get: jest.fn(),
};

function createMockContext(headers: Record<string, string> = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as any;
}

describe('AdminKeyGuard', () => {
  let guard: AdminKeyGuard;

  beforeEach(() => {
    guard = new AdminKeyGuard(mockConfigService as unknown as ConfigService);
    mockConfigService.get.mockReturnValue('test-admin-key-12345678901234567890');
  });

  it('allows request with valid X-Admin-Key', () => {
    const context = createMockContext({
      'x-admin-key': 'test-admin-key-12345678901234567890',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws UnauthorizedException when X-Admin-Key is missing', () => {
    const context = createMockContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when X-Admin-Key is incorrect', () => {
    const context = createMockContext({
      'x-admin-key': 'wrong-key',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when X-Admin-Key is empty string', () => {
    const context = createMockContext({
      'x-admin-key': '',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('reads ADMIN_API_KEY from config service', () => {
    const context = createMockContext({
      'x-admin-key': 'test-admin-key-12345678901234567890',
    });

    guard.canActivate(context);

    expect(mockConfigService.get).toHaveBeenCalledWith('ADMIN_API_KEY');
  });
});
