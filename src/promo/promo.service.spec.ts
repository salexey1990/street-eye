import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import { PromoService } from './promo.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const now = new Date();
const futureDate = new Date(Date.now() + 86400000 * 30);
const pastDate = new Date(Date.now() - 86400000);

const mockPromoCode = {
  id: 'promo-1',
  code: 'K7X2NP4G',
  usedById: null,
  usedBy: null,
  usedAt: null,
  expiresAt: futureDate,
  createdAt: now,
};

const mockPrisma = {
  promoCode: {
    findUnique: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
  subscription: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

const mockSubscriptionsService = {
  getStatus: jest.fn(),
};

describe('PromoService', () => {
  let service: PromoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromoService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubscriptionsService, useValue: mockSubscriptionsService },
      ],
    }).compile();

    service = module.get<PromoService>(PromoService);
    jest.clearAllMocks();
  });

  // ── redeem ────────────────────────────────────────────────────────────────

  describe('redeem', () => {
    it('throws NotFoundException when code does not exist', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(null);

      await expect(
        service.redeem('user-1', { code: 'XXXXXXXX' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when code is already used', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue({
        ...mockPromoCode,
        usedById: 'other-user',
      });

      await expect(
        service.redeem('user-1', { code: 'K7X2NP4G' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws GoneException when code is expired', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue({
        ...mockPromoCode,
        expiresAt: pastDate,
      });

      await expect(
        service.redeem('user-1', { code: 'K7X2NP4G' }),
      ).rejects.toBeInstanceOf(GoneException);
    });

    it('throws ConflictException when user already has premium', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(mockPromoCode);
      mockSubscriptionsService.getStatus.mockResolvedValue({
        isPremium: true,
        plan: 'premium',
      });

      await expect(
        service.redeem('user-1', { code: 'K7X2NP4G' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates subscription and marks code as used in a transaction', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(mockPromoCode);
      mockSubscriptionsService.getStatus
        .mockResolvedValueOnce({ isPremium: false, plan: 'free' })
        .mockResolvedValueOnce({ isPremium: true, plan: 'premium' });
      mockPrisma.$transaction.mockResolvedValue([]);

      const result = await service.redeem('user-1', { code: 'K7X2NP4G' });

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      const txArg = mockPrisma.$transaction.mock.calls[0][0];
      expect(txArg).toHaveLength(2);
      expect(result.isPremium).toBe(true);
    });

    it('normalizes code to uppercase and trims whitespace', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(null);

      await expect(
        service.redeem('user-1', { code: ' k7x2np4g ' }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mockPrisma.promoCode.findUnique).toHaveBeenCalledWith({
        where: { code: 'K7X2NP4G' },
      });
    });

    it('creates subscription with lifetime expiry and promo_ transaction ID', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(mockPromoCode);
      mockSubscriptionsService.getStatus
        .mockResolvedValueOnce({ isPremium: false })
        .mockResolvedValueOnce({ isPremium: true, plan: 'premium' });
      mockPrisma.$transaction.mockResolvedValue([]);

      await service.redeem('user-1', { code: 'K7X2NP4G' });

      // Verify the subscription.create call inside the transaction array
      const transactionArgs = mockPrisma.$transaction.mock.calls[0][0];
      // The second element should be the subscription create promise
      expect(transactionArgs).toHaveLength(2);
    });
  });

  // ── generate ──────────────────────────────────────────────────────────────

  describe('generate', () => {
    it('generates the requested number of codes', async () => {
      mockPrisma.promoCode.createMany.mockResolvedValue({ count: 5 });

      const result = await service.generate({
        count: 5,
        expiresAt: futureDate.toISOString(),
      });

      expect(result.codes).toHaveLength(5);
      expect(result.count).toBe(5);
    });

    it('generates codes with correct format (8 chars, uppercase alphanumeric)', async () => {
      mockPrisma.promoCode.createMany.mockResolvedValue({ count: 10 });

      const result = await service.generate({
        count: 10,
        expiresAt: futureDate.toISOString(),
      });

      for (const code of result.codes) {
        expect(code).toHaveLength(8);
        expect(code).toMatch(/^[A-Z2-9]+$/);
      }
    });

    it('does not include ambiguous characters (0, O, 1, I)', async () => {
      mockPrisma.promoCode.createMany.mockResolvedValue({ count: 50 });

      const result = await service.generate({
        count: 50,
        expiresAt: futureDate.toISOString(),
      });

      for (const code of result.codes) {
        expect(code).not.toMatch(/[01OI]/);
      }
    });

    it('generates unique codes within the same batch', async () => {
      mockPrisma.promoCode.createMany.mockResolvedValue({ count: 20 });

      const result = await service.generate({
        count: 20,
        expiresAt: futureDate.toISOString(),
      });

      const uniqueCodes = new Set(result.codes);
      expect(uniqueCodes.size).toBe(20);
    });

    it('passes correct expiration date to database', async () => {
      const expiresAt = '2026-12-31T23:59:59.000Z';
      mockPrisma.promoCode.createMany.mockResolvedValue({ count: 1 });

      const result = await service.generate({ count: 1, expiresAt });

      expect(mockPrisma.promoCode.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            expiresAt: new Date(expiresAt),
          }),
        ]),
      });
      expect(result.expiresAt).toBe(new Date(expiresAt).toISOString());
    });

    it('uses createMany to batch insert codes', async () => {
      mockPrisma.promoCode.createMany.mockResolvedValue({ count: 3 });

      await service.generate({
        count: 3,
        expiresAt: futureDate.toISOString(),
      });

      expect(mockPrisma.promoCode.createMany).toHaveBeenCalledTimes(1);
      const data = mockPrisma.promoCode.createMany.mock.calls[0][0].data;
      expect(data).toHaveLength(3);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all promo codes when no filter is provided', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([
        { ...mockPromoCode, usedBy: null },
      ]);

      const result = await service.list();

      expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(result).toHaveLength(1);
    });

    it('filters by used status', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([]);

      await service.list('used');

      expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { usedById: { not: null } },
        }),
      );
    });

    it('filters by available status (unused and not expired)', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([]);

      await service.list('available');

      expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            usedById: null,
            expiresAt: { gt: expect.any(Date) },
          },
        }),
      );
    });

    it('filters by expired status (unused and past expiry)', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([]);

      await service.list('expired');

      expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            usedById: null,
            expiresAt: { lte: expect.any(Date) },
          },
        }),
      );
    });

    it('maps response with usedBy email', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([
        {
          ...mockPromoCode,
          usedById: 'user-1',
          usedBy: { email: 'user@example.com' },
          usedAt: now,
        },
      ]);

      const result = await service.list('used');

      expect(result[0].usedBy).toBe('user@example.com');
      expect(result[0].usedAt).toBe(now.toISOString());
    });

    it('returns null for usedBy when code is unused', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([
        { ...mockPromoCode, usedBy: null },
      ]);

      const result = await service.list();

      expect(result[0].usedBy).toBeNull();
      expect(result[0].usedAt).toBeNull();
    });

    it('orders results by createdAt descending', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([]);

      await service.list();

      expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
