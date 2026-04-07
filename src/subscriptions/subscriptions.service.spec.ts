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

// RSA private key (PKCS#8, 2048-bit) generated for tests only
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCojVf0ZMufBUfy
Dl63oCPSV5xLnHamkgiNZxlpOfR+F4kfJ0WLUbPq9+b/lI7qtWHmeEazaG2E/KgD
kWRUct2M+/Lmi9NMQUGWsQxTqDgEkFBRUZiQBJd8+wOQeP3s7gQeAZec4POwZiYa
pinsPPJJY3NGs90PXWXfHF9Hwdx6PnbKHN7KYfLMBvCyApuB9u4U68KWhFxALU9J
r7HPVBepRJAHVgfkj84p6euFKyHQiYd0jfkCvG+mvCFnffAedC27g0tR0SHehSzx
65hjUY+cJMYWKcCywW8MjLxO5sdtzoPTBdzIbLfJrsnFQ16BAregzaHm+ezgXUHI
1cAdgCEdAgMBAAECggEAI+8eVUg38QsbL4vIvbUybeGnvKb61MBFeoAEdt6YNVmn
LjEdLnqYtPttEAgIABnzaUMzL4SP9M44s6oHjcl/WlNMkcI1pggzh4Dvc9ZlOvPZ
a7zNncac1VReiiqBWEXWMt98B0IeMflVHlFWlrrXnLXLGcO22VO8KDjQR2gZLSZT
WUr/qTg2Jx6oMEEdKr82oQrJr+U85ttL008z2h3Bfzqwmwl7Jg4P8qKQIMMPleVP
KSpxaMAGIWOruMPJrSfpiHf7lcj467PJSAAHZdRSO2cdavJekruC5LIORLIOlvbO
P++SYm4/Eev6I39FCT60jG8dbwe9g1GJhy0GHQUlsQKBgQDZxUHpB66t0rU/mPKH
Vy6tCsF7Ppnr17sQ04o7KhEBGkSrdvJa0nsWbMyL5OcqHQI8F73y/cZnK3onsY/g
rvQ6a1RQzZgTWdiINWsZM4hcnSCJjuCAndBaBbqtI0MpKMmv8NuNKAijnGkfi5Id
qNDVCGaJlej9eCfUeLOxh9fQTwKBgQDGJC4gQ7En0SRD1+J3ehMOr2gogz/hRaFR
6KRqh1Scg31eC9gFBsWszkqwZ0Lco9QCUif/N973rBvYNZvucCFbmNveDDzkN8fj
n2HMsV3nAASWfXggsZiqUD06NtixYSLtaUcSPx/RoIAmGBmbkUFjv0CVdKnOlzRi
rEjNr52Q0wKBgFj/C0uPjyyMYvQFrn/u+i1PqviSAddnR5S9zs0VCPP5ZzznlG3X
fOQSPJmjR3Fnf4VNcpw+Z/m7w+U65IC/HyJMwJ1xGAg4fIxVwFoBPGYU9LoiwM7v
L7nKg5rEQWsttxcHCMKsLLOodTGmGWWzmvykvTrXH+uOUkC7vzv7NxBzAoGBAJew
Aw/4Qpt05Qp7L4jAD+7iIh9Bu5m+MK4AKD7Vs9TOZR+meY3/jT2qAEvkAa/gS+Iq
+yvLngqF3Bs9j06O0TrKXygyvjsI6SI9ViXac0TxIpIDJAADdhiMrRLwAhxpfM+8
FQjHApj9Ap4nPRN3tFOkitDgK09ZOmV/94xfsYS5AoGAWUJDMTySdta2OGbjH0V2
5mwa3p9N1yDQha7egykBRpXYrIQRYJfwK6fLQ/3w1rseEcF+KdhbyQFDHysvcA6Q
uuSJ+GOk3xDPbB5FmKOXDwlYcWkEAQHFhbkNi7e9RqZ8R+1uIaNHdSv1bZanfPew
xZs1++RWzYEzhSYqbvJdR9o=
-----END PRIVATE KEY-----`;

const MOCK_SERVICE_ACCOUNT = JSON.stringify({
  client_email: 'test@project.iam.gserviceaccount.com',
  private_key: TEST_PRIVATE_KEY,
});

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'APPLE_SHARED_SECRET') return 'test-shared-secret';
    if (key === 'GOOGLE_SERVICE_ACCOUNT_KEY') return MOCK_SERVICE_ACCOUNT;
    if (key === 'GOOGLE_PLAY_PACKAGE_NAME') return 'com.example.streeteye';
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
    const androidDto = {
      receipt: 'google-purchase-token',
      platform: 'ANDROID' as const,
      productId: 'streeteye_premium_monthly',
    };

    function mockGoogleFlow(subscriptionData: Record<string, unknown>) {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ access_token: 'test-access-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(subscriptionData),
        });
    }

    it('exchanges service account JWT for an access token', async () => {
      mockGoogleFlow({
        expiryTimeMillis: String(futureDate.getTime()),
        orderId: 'GPA.1234-5678-9012-34567',
        paymentState: 1,
      });
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      await service.verifyPurchase('user-1', androidDto);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth2.googleapis.com/token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('calls Google Play Developer API with correct URL', async () => {
      mockGoogleFlow({
        expiryTimeMillis: String(futureDate.getTime()),
        orderId: 'GPA.1234-5678-9012-34567',
        paymentState: 1,
      });
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      await service.verifyPurchase('user-1', androidDto);

      const apiCall = mockFetch.mock.calls[1];
      expect(apiCall[0]).toBe(
        'https://androidpublisher.googleapis.com/androidpublisher/v3/applications' +
          '/com.example.streeteye/purchases/subscriptions/streeteye_premium_monthly' +
          '/tokens/google-purchase-token',
      );
      expect(apiCall[1].headers.Authorization).toBe('Bearer test-access-token');
    });

    it('upserts subscription with orderId as transactionId', async () => {
      mockGoogleFlow({
        expiryTimeMillis: String(futureDate.getTime()),
        orderId: 'GPA.1234-5678-9012-34567',
        paymentState: 1,
      });
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      await service.verifyPurchase('user-1', androidDto);

      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { transactionId: 'GPA.1234-5678-9012-34567' },
          create: expect.objectContaining({ platform: 'ANDROID' }),
        }),
      );
    });

    it('accepts free trial (paymentState = 2)', async () => {
      mockGoogleFlow({
        expiryTimeMillis: String(futureDate.getTime()),
        orderId: 'GPA.trial-order',
        paymentState: 2,
      });
      mockPrisma.subscription.upsert.mockResolvedValue({});
      mockPrisma.subscription.findFirst.mockResolvedValue(mockActiveSubscription);

      const result = await service.verifyPurchase('user-1', androidDto);
      expect(result.isPremium).toBe(true);
    });

    it('throws BadRequestException when paymentState is pending (0)', async () => {
      mockGoogleFlow({
        expiryTimeMillis: String(futureDate.getTime()),
        orderId: 'GPA.1234',
        paymentState: 0,
      });

      await expect(service.verifyPurchase('user-1', androidDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when Google Play API returns non-200', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue({ access_token: 'test-token' }),
        })
        .mockResolvedValueOnce({ ok: false });

      await expect(service.verifyPurchase('user-1', androidDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when token exchange fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      await expect(service.verifyPurchase('user-1', androidDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when GOOGLE_SERVICE_ACCOUNT_KEY is not configured', async () => {
      jest
        .spyOn(mockConfigService, 'get')
        .mockImplementation((key: string) => {
          if (key === 'GOOGLE_SERVICE_ACCOUNT_KEY') return undefined;
          if (key === 'GOOGLE_PLAY_PACKAGE_NAME') return 'com.example.streeteye';
          return undefined;
        });

      await expect(service.verifyPurchase('user-1', androidDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when GOOGLE_PLAY_PACKAGE_NAME is not configured', async () => {
      jest
        .spyOn(mockConfigService, 'get')
        .mockImplementation((key: string) => {
          if (key === 'GOOGLE_SERVICE_ACCOUNT_KEY') return MOCK_SERVICE_ACCOUNT;
          if (key === 'GOOGLE_PLAY_PACKAGE_NAME') return undefined;
          return undefined;
        });

      await expect(service.verifyPurchase('user-1', androidDto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
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
