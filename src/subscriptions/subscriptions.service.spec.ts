import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';

const now = new Date();
const futureDate = new Date(Date.now() + 86400000 * 30); // 30 days from now
const pastDate = new Date(Date.now() - 86400000); // yesterday

const mockActiveSubscription = {
  id: 'sub-1',
  userId: 'user-1',
  platform: 'IOS' as const,
  productId: 'streeteye_premium_monthly',
  transactionId: 'txn-123',
  receipt: 'receipt-data',
  status: 'ACTIVE' as const,
  expiresAt: futureDate,
  createdAt: now,
  updatedAt: now,
};

const mockPrisma = {
  subscription: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
  },
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'APPLE_SHARED_SECRET') return 'test-shared-secret';
    return undefined;
  }),
};

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    jest.clearAllMocks();
  });

  // ── getStatus ──────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('returns free plan when no active subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const status = await service.getStatus('user-1');

      expect(status.isPremium).toBe(false);
      expect(status.plan).toBe('free');
      expect(status.expiresAt).toBeNull();
    });

    it('returns free limits when no active subscription', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      const status = await service.getStatus('user-1');

      expect(status.limits.tasksPerMonth).toBe(10);
      expect(status.limits.anotherTaskPerSession).toBe(1);
      expect(status.limits.journalEntriesVisible).toBe(10);
    });

    it('returns premium plan when active subscription exists', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      const status = await service.getStatus('user-1');

      expect(status.isPremium).toBe(true);
      expect(status.plan).toBe('premium');
      expect(status.expiresAt).toBe(futureDate.toISOString());
    });

    it('returns premium limits when subscription is active', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      const status = await service.getStatus('user-1');

      expect(status.limits.tasksPerMonth).toBe(-1);
      expect(status.limits.anotherTaskPerSession).toBe(3);
      expect(status.limits.journalEntriesVisible).toBe(-1);
    });

    it('queries for active non-expired subscription only', async () => {
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await service.getStatus('user-1');

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
  });

  // ── verifyPurchase (iOS) ──────────────────────────────────────────────────

  describe('verifyPurchase — iOS', () => {
    const iosDto = {
      receipt: 'base64-receipt-data',
      platform: 'IOS' as const,
      productId: 'streeteye_premium_monthly',
    };

    it('calls Apple App Store verification endpoint', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: 0,
          latest_receipt_info: [
            {
              transaction_id: 'txn-apple-1',
              expires_date_ms: String(futureDate.getTime()),
            },
          ],
        }),
      });
      mockPrisma.subscription.upsert.mockResolvedValue(mockActiveSubscription);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      await service.verifyPurchase('user-1', iosDto);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://buy.itunes.apple.com/verifyReceipt',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('falls back to sandbox when status is 21007', async () => {
      mockFetch
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({ status: 21007 }),
        })
        .mockResolvedValueOnce({
          json: jest.fn().mockResolvedValue({
            status: 0,
            latest_receipt_info: [
              {
                transaction_id: 'txn-sandbox-1',
                expires_date_ms: String(futureDate.getTime()),
              },
            ],
          }),
        });
      mockPrisma.subscription.upsert.mockResolvedValue(mockActiveSubscription);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      await service.verifyPurchase('user-1', iosDto);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[1][0]).toBe('https://sandbox.itunes.apple.com/verifyReceipt');
    });

    it('throws BadRequestException for non-zero Apple status', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 21002 }),
      });

      await expect(service.verifyPurchase('user-1', iosDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when latest_receipt_info is missing', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({ status: 0, latest_receipt_info: [] }),
      });

      await expect(service.verifyPurchase('user-1', iosDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('upserts subscription with correct data on success', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: 0,
          latest_receipt_info: [
            {
              transaction_id: 'txn-new',
              expires_date_ms: String(futureDate.getTime()),
            },
          ],
        }),
      });
      mockPrisma.subscription.upsert.mockResolvedValue(mockActiveSubscription);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      await service.verifyPurchase('user-1', iosDto);

      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith({
        where: { transactionId: 'txn-new' },
        update: { status: 'ACTIVE', expiresAt: expect.any(Date) },
        create: expect.objectContaining({
          userId: 'user-1',
          platform: 'IOS',
          productId: 'streeteye_premium_monthly',
          transactionId: 'txn-new',
          status: 'ACTIVE',
        }),
      });
    });

    it('returns updated subscription status after verification', async () => {
      mockFetch.mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          status: 0,
          latest_receipt_info: [
            {
              transaction_id: 'txn-new',
              expires_date_ms: String(futureDate.getTime()),
            },
          ],
        }),
      });
      mockPrisma.subscription.upsert.mockResolvedValue(mockActiveSubscription);
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      const result = await service.verifyPurchase('user-1', iosDto);

      expect(result.isPremium).toBe(true);
      expect(result.plan).toBe('premium');
    });
  });

  // ── verifyPurchase (Android) ──────────────────────────────────────────────

  describe('verifyPurchase — Android', () => {
    it('throws BadRequestException as Google Play verification is not yet implemented', async () => {
      await expect(
        service.verifyPurchase('user-1', {
          receipt: 'google-purchase-token',
          platform: 'ANDROID',
          productId: 'streeteye_premium_monthly',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── restorePurchase ───────────────────────────────────────────────────────

  describe('restorePurchase', () => {
    it('delegates to verifyPurchase', async () => {
      const verifySpy = jest.spyOn(service, 'verifyPurchase').mockResolvedValue({
        isPremium: true,
        plan: 'premium',
        expiresAt: futureDate.toISOString(),
        limits: { tasksPerMonth: -1, anotherTaskPerSession: 3, journalEntriesVisible: -1 },
      });

      const dto = {
        receipt: 'receipt',
        platform: 'IOS' as const,
        productId: 'streeteye_premium_monthly',
      };
      const result = await service.restorePurchase('user-1', dto);

      expect(verifySpy).toHaveBeenCalledWith('user-1', dto);
      expect(result.isPremium).toBe(true);
    });
  });
});
