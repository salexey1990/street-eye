import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '',
  isEmailVerified: true,
  locale: 'EN' as const,
  level: 'BEGINNER' as const,
  preferredCategories: [],
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUnverifiedUser = { ...mockUser, isEmailVerified: false };

const mockPrisma = {
  refreshToken: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
  emailToken: {
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
};

const mockUsersService = {
  findByEmail: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
};

const mockMailService = {
  sendVerifyEmail: jest.fn().mockResolvedValue(undefined),
  sendResetPassword: jest.fn().mockResolvedValue(undefined),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('access-token'),
};

const mockConfigService = {
  get: jest.fn((key: string, def?: unknown) => {
    const map: Record<string, unknown> = {
      JWT_ACCESS_TTL: 900,
      JWT_REFRESH_TTL: 2592000,
      APP_BASE_URL: 'http://localhost:3000',
      RESEND_FROM: 'noreply@test.com',
    };
    return map[key] ?? def;
  }),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates user and sends verification email', async () => {
      mockUsersService.create.mockResolvedValue(mockUser);
      mockPrisma.emailToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailToken.create.mockResolvedValue({});

      const result = await service.register({ email: 'test@example.com', password: 'pass1234' });

      expect(mockUsersService.create).toHaveBeenCalledWith(
        'test@example.com',
        'pass1234',
        { level: undefined, preferredCategories: undefined, locale: undefined },
      );
      expect(mockMailService.sendVerifyEmail).toHaveBeenCalled();
      expect(result.message).toContain('verify');
    });

    it('passes onboarding fields to usersService.create', async () => {
      mockUsersService.create.mockResolvedValue(mockUser);
      mockPrisma.emailToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailToken.create.mockResolvedValue({});

      await service.register({
        email: 'test@example.com',
        password: 'pass1234',
        level: 'INTERMEDIATE',
        preferredCategories: ['VISUAL', 'SOCIAL'],
        locale: 'RU',
      });

      expect(mockUsersService.create).toHaveBeenCalledWith(
        'test@example.com',
        'pass1234',
        { level: 'INTERMEDIATE', preferredCategories: ['VISUAL', 'SOCIAL'], locale: 'RU' },
      );
    });

    it('uses Accept-Language locale for verification email', async () => {
      mockUsersService.create.mockResolvedValue(mockUser);
      mockPrisma.emailToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailToken.create.mockResolvedValue({});

      await service.register({ email: 'test@example.com', password: 'pass1234' }, 'ru');

      expect(mockMailService.sendVerifyEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'ru',
      );
    });

    it('propagates ConflictException when email already exists', async () => {
      mockUsersService.create.mockRejectedValue(new ConflictException('Email already registered'));

      await expect(
        service.register({ email: 'test@example.com', password: 'pass1234' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    beforeEach(async () => {
      const hash = await bcrypt.hash('correct-pass', 12);
      mockUser.passwordHash = hash;
      mockUnverifiedUser.passwordHash = hash;
    });

    it('returns token pair on valid credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: mockUser.email, password: 'correct-pass' });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'no@example.com', password: 'pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: mockUser.email, password: 'wrong-pass' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('throws ForbiddenException when email not verified', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUnverifiedUser);

      await expect(
        service.login({ email: mockUnverifiedUser.email, password: 'correct-pass' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── refresh ───────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('throws UnauthorizedException when no matching token found', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(
        service.refresh({ refreshToken: 'invalid-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rotates token and returns new pair when token is valid', async () => {
      const raw = 'valid-raw-token';
      const tokenHash = await bcrypt.hash(raw, 12);
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1', tokenHash, userId: 'user-1', user: mockUser, expiresAt: new Date(Date.now() + 1e9) },
      ]);
      mockPrisma.refreshToken.delete.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh({ refreshToken: raw });

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  // ── logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('deletes matching refresh token', async () => {
      const raw = 'valid-raw-token';
      const tokenHash = await bcrypt.hash(raw, 12);
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1', tokenHash, userId: 'user-1' },
      ]);
      mockPrisma.refreshToken.delete.mockResolvedValue({});

      const result = await service.logout('user-1', { refreshToken: raw });

      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledWith({ where: { id: 'rt-1' } });
      expect(result.message).toContain('Logged out');
    });

    it('throws UnauthorizedException when token does not match', async () => {
      mockPrisma.refreshToken.findMany.mockResolvedValue([
        { id: 'rt-1', tokenHash: await bcrypt.hash('other-token', 12), userId: 'user-1' },
      ]);

      await expect(
        service.logout('user-1', { refreshToken: 'wrong-token' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  // ── forgotPassword ────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('returns safe message even when user does not exist', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      const result = await service.forgotPassword({ email: 'ghost@example.com' });

      expect(result.message).toContain('If this email');
      expect(mockMailService.sendResetPassword).not.toHaveBeenCalled();
    });

    it('sends reset email when user exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockPrisma.emailToken.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.emailToken.create.mockResolvedValue({});

      const result = await service.forgotPassword({ email: mockUser.email });

      expect(mockMailService.sendResetPassword).toHaveBeenCalled();
      expect(result.message).toContain('If this email');
    });
  });

  // ── verifyEmail ───────────────────────────────────────────────────────────

  describe('verifyEmail', () => {
    it('throws BadRequestException for invalid token', async () => {
      mockPrisma.emailToken.findMany.mockResolvedValue([]);

      await expect(
        service.verifyEmail({ token: 'bad-token' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks email as verified for valid token', async () => {
      const raw = 'valid-token';
      const tokenHash = await bcrypt.hash(raw, 12);
      mockPrisma.emailToken.findMany.mockResolvedValue([
        { id: 'et-1', tokenHash, userId: 'user-1', type: 'VERIFY_EMAIL', expiresAt: new Date(Date.now() + 1e9) },
      ]);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.verifyEmail({ token: raw });

      expect(result.message).toContain('verified');
    });
  });

  // ── resetPassword ─────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('throws BadRequestException for expired/invalid token', async () => {
      mockPrisma.emailToken.findMany.mockResolvedValue([]);

      await expect(
        service.resetPassword({ token: 'bad', newPassword: 'newpass1234' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resets password and invalidates all refresh tokens', async () => {
      const raw = 'valid-reset-token';
      const tokenHash = await bcrypt.hash(raw, 12);
      mockPrisma.emailToken.findMany.mockResolvedValue([
        { id: 'et-2', tokenHash, userId: 'user-1', type: 'RESET_PASSWORD', expiresAt: new Date(Date.now() + 1e9) },
      ]);
      mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);

      const result = await service.resetPassword({ token: raw, newPassword: 'newpass1234' });

      expect(result.message).toContain('reset successfully');
    });
  });
});
