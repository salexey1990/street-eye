import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const mockToken = {
  id: 'pt-1',
  userId: 'user-1',
  token: 'ExponentPushToken[abc123]',
  platform: 'IOS' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUser = {
  id: 'user-1',
  locale: 'EN' as const,
};

const mockPrisma = {
  pushToken: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  taskSession: {
    findMany: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'EXPO_ACCESS_TOKEN') return 'expo-test-token';
    return undefined;
  }),
};

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
  });

  // ── savePushToken ─────────────────────────────────────────────────────────

  describe('savePushToken', () => {
    it('upserts push token for user', async () => {
      mockPrisma.pushToken.upsert.mockResolvedValue(mockToken);

      await service.savePushToken('user-1', {
        token: 'ExponentPushToken[abc123]',
        platform: 'IOS',
      });

      expect(mockPrisma.pushToken.upsert).toHaveBeenCalledWith({
        where: { token: 'ExponentPushToken[abc123]' },
        update: { userId: 'user-1', platform: 'IOS' },
        create: { userId: 'user-1', token: 'ExponentPushToken[abc123]', platform: 'IOS' },
      });
    });

    it('works for Android platform', async () => {
      mockPrisma.pushToken.upsert.mockResolvedValue({ ...mockToken, platform: 'ANDROID' });

      await service.savePushToken('user-1', {
        token: 'ExponentPushToken[android123]',
        platform: 'ANDROID',
      });

      expect(mockPrisma.pushToken.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ platform: 'ANDROID' }),
        }),
      );
    });
  });

  // ── deletePushToken ───────────────────────────────────────────────────────

  describe('deletePushToken', () => {
    it('deletes push token by userId and token', async () => {
      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.deletePushToken('user-1', 'ExponentPushToken[abc123]');

      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', token: 'ExponentPushToken[abc123]' },
      });
    });

    it('does not throw when token does not exist', async () => {
      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deletePushToken('user-1', 'nonexistent-token'),
      ).resolves.not.toThrow();
    });
  });

  // ── deleteAllUserPushTokens ───────────────────────────────────────────────

  describe('deleteAllUserPushTokens', () => {
    it('deletes all tokens for a user', async () => {
      mockPrisma.pushToken.deleteMany.mockResolvedValue({ count: 2 });

      await service.deleteAllUserPushTokens('user-1');

      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });
  });

  // ── sendPush ──────────────────────────────────────────────────────────────

  describe('sendPush', () => {
    it('does nothing when user has no push tokens', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([]);

      await service.sendPush('user-1', 'Title', 'Body');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends push via Expo API when tokens exist', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([mockToken]);

      await service.sendPush('user-1', 'Title', 'Body');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://exp.host/--/api/v2/push/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body[0]).toEqual(
        expect.objectContaining({
          to: mockToken.token,
          title: 'Title',
          body: 'Body',
        }),
      );
    });

    it('sends to all tokens of user', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([
        mockToken,
        { ...mockToken, id: 'pt-2', token: 'ExponentPushToken[def456]', platform: 'ANDROID' },
      ]);

      await service.sendPush('user-1', 'Title', 'Body');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toHaveLength(2);
    });

    it('includes Authorization header when EXPO_ACCESS_TOKEN is set', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([mockToken]);

      await service.sendPush('user-1', 'Title', 'Body');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer expo-test-token');
    });

    it('does not throw when Expo API call fails', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([mockToken]);
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.sendPush('user-1', 'Title', 'Body')).resolves.not.toThrow();
    });
  });

  // ── sendDailyReminders ────────────────────────────────────────────────────

  describe('sendDailyReminders', () => {
    it('sends push only to users with no activity today', async () => {
      // user-2 has a token but no activity → should receive push
      // user-1 has a token but already has activity → should NOT receive push
      mockPrisma.taskSession.findMany.mockResolvedValueOnce([
        { userId: 'user-1' }, // has activity today
      ]);
      mockPrisma.pushToken.findMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ locale: 'EN' }) // for user-2
        .mockResolvedValueOnce({ locale: 'RU' });

      mockPrisma.pushToken.findMany
        .mockResolvedValueOnce([{ token: 'ExponentPushToken[user2]' }]);

      // Replace sendPush with spy to avoid real fetch
      const sendPushSpy = jest.spyOn(service, 'sendPush').mockResolvedValue();

      await service.sendDailyReminders();

      // user-1 was active today, so no push to them
      expect(sendPushSpy).not.toHaveBeenCalledWith('user-1', expect.any(String), expect.any(String));
    });

    it('sends Russian text to RU locale users', async () => {
      mockPrisma.taskSession.findMany.mockResolvedValue([]); // no activity today
      mockPrisma.pushToken.findMany.mockResolvedValue([{ userId: 'user-ru' }]);
      mockPrisma.user.findUnique.mockResolvedValue({ locale: 'RU' });

      const sendPushSpy = jest.spyOn(service, 'sendPush').mockResolvedValue();

      await service.sendDailyReminders();

      expect(sendPushSpy).toHaveBeenCalledWith(
        'user-ru',
        'Время выйти на улицу',
        'Новое задание ждёт вас',
      );
    });

    it('sends English text to EN locale users', async () => {
      mockPrisma.taskSession.findMany.mockResolvedValue([]);
      mockPrisma.pushToken.findMany.mockResolvedValue([{ userId: 'user-en' }]);
      mockPrisma.user.findUnique.mockResolvedValue({ locale: 'EN' });

      const sendPushSpy = jest.spyOn(service, 'sendPush').mockResolvedValue();

      await service.sendDailyReminders();

      expect(sendPushSpy).toHaveBeenCalledWith(
        'user-en',
        'Time to go outside',
        'A new assignment is waiting for you',
      );
    });
  });

  // ── sendStreakWarnings ────────────────────────────────────────────────────

  describe('sendStreakWarnings', () => {
    it('does not send warning to users who already completed today', async () => {
      // user-1 completed yesterday (has streak) AND today → no warning
      mockPrisma.taskSession.findMany
        .mockResolvedValueOnce([{ userId: 'user-1' }])  // completed today
        .mockResolvedValueOnce([{ userId: 'user-1' }]); // had streak yesterday

      const sendPushSpy = jest.spyOn(service, 'sendPush').mockResolvedValue();

      await service.sendStreakWarnings();

      expect(sendPushSpy).not.toHaveBeenCalled();
    });

    it('sends streak warning to users who had streak yesterday but not completed today', async () => {
      mockPrisma.taskSession.findMany
        .mockResolvedValueOnce([])                      // no completions today
        .mockResolvedValueOnce([{ userId: 'user-1' }]); // had completion yesterday
      mockPrisma.user.findUnique.mockResolvedValue({ locale: 'EN' });

      const sendPushSpy = jest.spyOn(service, 'sendPush').mockResolvedValue();

      await service.sendStreakWarnings();

      expect(sendPushSpy).toHaveBeenCalledWith(
        'user-1',
        'Streak at risk',
        expect.stringContaining('streak'),
      );
    });

    it('sends Russian streak warning to RU locale users', async () => {
      mockPrisma.taskSession.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ userId: 'user-ru' }]);
      mockPrisma.user.findUnique.mockResolvedValue({ locale: 'RU' });

      const sendPushSpy = jest.spyOn(service, 'sendPush').mockResolvedValue();

      await service.sendStreakWarnings();

      expect(sendPushSpy).toHaveBeenCalledWith(
        'user-ru',
        'Серия под угрозой',
        expect.any(String),
      );
    });
  });
});
