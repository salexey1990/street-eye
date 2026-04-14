import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

const now = new Date();

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$2b$12$hashedpassword',
  isEmailVerified: true,
  locale: 'EN' as const,
  level: 'BEGINNER' as const,
  preferredCategories: ['VISUAL'] as const,
  createdAt: now,
  updatedAt: now,
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  taskSession: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  userBadge: {
    count: jest.fn(),
  },
  subscription: {
    findFirst: jest.fn(),
  },
  refreshToken: {
    deleteMany: jest.fn(),
  },
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => key === 'MONETIZATION_ENABLED' ? true : undefined },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates user with email and password only', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.create('test@example.com', 'password123');

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
        }),
      });
    });

    it('creates user with onboarding level', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, level: 'INTERMEDIATE' });

      await service.create('test@example.com', 'password123', { level: 'INTERMEDIATE' });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ level: 'INTERMEDIATE' }),
      });
    });

    it('creates user with onboarding preferredCategories', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.create('test@example.com', 'password123', {
        preferredCategories: ['SOCIAL', 'TECHNICAL'],
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ preferredCategories: ['SOCIAL', 'TECHNICAL'] }),
      });
    });

    it('creates user with onboarding locale', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...mockUser, locale: 'RU' });

      await service.create('test@example.com', 'password123', { locale: 'RU' });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ locale: 'RU' }),
      });
    });

    it('creates user with all onboarding fields at once', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.create('test@example.com', 'password123', {
        level: 'PRO',
        preferredCategories: ['VISUAL', 'RESTRICTION'],
        locale: 'RU',
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 'PRO',
          preferredCategories: ['VISUAL', 'RESTRICTION'],
          locale: 'RU',
        }),
      });
    });

    it('does not include undefined optional fields in create data', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.create('test@example.com', 'password123', {});

      const callArg = mockPrisma.user.create.mock.calls[0][0];
      expect(callArg.data).not.toHaveProperty('level');
      expect(callArg.data).not.toHaveProperty('locale');
    });

    it('throws ConflictException when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.create('test@example.com', 'password123'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('normalises email to lowercase', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);

      await service.create('TEST@EXAMPLE.COM', 'password123');

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'test@example.com' }),
      });
    });
  });

  // ── getProfileWithStats ────────────────────────────────────────────────────

  describe('getProfileWithStats', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.taskSession.count.mockResolvedValue(5);
      mockPrisma.userBadge.count.mockResolvedValue(2);
      mockPrisma.taskSession.findMany.mockResolvedValue([]);
    });

    it('returns isPremium: false when no active subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const profile = await service.getProfileWithStats('user-1');

      expect(profile.isPremium).toBe(false);
      expect(profile.subscriptionExpiresAt).toBeNull();
    });

    it('returns isPremium: true when active subscription exists', async () => {
      const expiresAt = new Date(Date.now() + 86400000 * 30);
      mockPrisma.subscription.findFirst.mockResolvedValue({ expiresAt });

      const profile = await service.getProfileWithStats('user-1');

      expect(profile.isPremium).toBe(true);
      expect(profile.subscriptionExpiresAt).toBe(expiresAt.toISOString());
    });

    it('queries for active non-expired subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await service.getProfileWithStats('user-1');

      expect(mockPrisma.subscription.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            status: 'ACTIVE',
            expiresAt: { gt: expect.any(Date) },
          }),
        }),
      );
    });

    it('includes stats fields in response', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const profile = await service.getProfileWithStats('user-1');

      expect(profile.stats.totalCompleted).toBe(5);
      expect(profile.stats.badgesEarned).toBe(2);
      expect(typeof profile.stats.currentStreak).toBe('number');
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfileWithStats('bad-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('throws UnauthorizedException when current password is wrong', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        // hash of 'correct-pass'
        passwordHash: '$2b$12$notthisone',
      });

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'wrong-pass',
          newPassword: 'newpass1234',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
