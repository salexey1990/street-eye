import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JournalService } from './journal.service';
import { PrismaService } from '../prisma/prisma.service';

// Fixed "today" for deterministic streak tests
const TODAY = '2026-04-07';
const YESTERDAY = '2026-04-06';

function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

// Freeze Date.now() so streak calculations are deterministic
const realDateNow = Date.now.bind(global.Date);
beforeAll(() => {
  const todayTs = new Date(`${TODAY}T12:00:00.000Z`).getTime();
  global.Date.now = jest.fn().mockReturnValue(todayTs);
});
afterAll(() => {
  global.Date.now = realDateNow;
});

const mockPrisma = {
  taskSession: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  journalEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
};

const mockSession = {
  id: 'session-1',
  userId: 'user-1',
  taskId: 'task-1',
  status: 'COMPLETED' as const,
  startedAt: new Date(),
  completedAt: toDate(TODAY),
  task: { category: 'VISUAL', level: 'BEGINNER' },
};

const mockEntry = {
  id: 'entry-1',
  userId: 'user-1',
  sessionId: 'session-1',
  note: 'Great session',
  selfRating: 'SUCCESS',
  hasPhoto: true,
  createdAt: toDate(TODAY),
  updatedAt: toDate(TODAY),
  session: { task: { category: 'VISUAL', level: 'BEGINNER' } },
};

describe('JournalService', () => {
  let service: JournalService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
      ],
    }).compile();

    service = module.get<JournalService>(JournalService);
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates an entry for a COMPLETED session', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(mockSession);
      mockPrisma.journalEntry.findUnique.mockResolvedValue(null);
      mockPrisma.journalEntry.create.mockResolvedValue(mockEntry);

      const result = await service.create('user-1', {
        sessionId: 'session-1',
        selfRating: 'SUCCESS',
        hasPhoto: true,
      });

      expect(result.id).toBe('entry-1');
      expect(result.category).toBe('VISUAL');
      expect(mockPrisma.journalEntry.create).toHaveBeenCalled();
      expect(mockRedis.del).toHaveBeenCalledWith('journal:stats:user-1');
    });

    it('throws NotFoundException when session does not exist', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { sessionId: 'bad-id', selfRating: 'SUCCESS' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when session belongs to another user', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue({ ...mockSession, userId: 'other' });

      await expect(
        service.create('user-1', { sessionId: 'session-1', selfRating: 'SUCCESS' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when session is not COMPLETED', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue({ ...mockSession, status: 'ACTIVE' });

      await expect(
        service.create('user-1', { sessionId: 'session-1', selfRating: 'SUCCESS' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when entry already exists for the session', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(mockSession);
      mockPrisma.journalEntry.findUnique.mockResolvedValue(mockEntry);

      await expect(
        service.create('user-1', { sessionId: 'session-1', selfRating: 'SUCCESS' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated entries', async () => {
      mockPrisma.journalEntry.findMany.mockResolvedValue([mockEntry]);

      const result = await service.findAll('user-1', { limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('detects hasMore and sets nextCursor', async () => {
      const entries = Array.from({ length: 3 }, (_, i) => ({ ...mockEntry, id: `entry-${i}` }));
      mockPrisma.journalEntry.findMany.mockResolvedValue(entries);

      const result = await service.findAll('user-1', { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('entry-1');
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns entry by id', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue(mockEntry);

      const result = await service.findOne('user-1', 'entry-1');
      expect(result.id).toBe('entry-1');
    });

    it('throws NotFoundException for missing entry', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for another user entry', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue({ ...mockEntry, userId: 'other' });

      await expect(service.findOne('user-1', 'entry-1')).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates the entry and invalidates cache', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.journalEntry.update.mockResolvedValue({ ...mockEntry, note: 'Updated' });

      const result = await service.update('user-1', 'entry-1', { note: 'Updated' });

      expect(result.note).toBe('Updated');
      expect(mockRedis.del).toHaveBeenCalledWith('journal:stats:user-1');
    });

    it('throws NotFoundException for missing entry', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue(null);

      await expect(service.update('user-1', 'bad-id', { note: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the entry and invalidates cache', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue(mockEntry);
      mockPrisma.journalEntry.delete.mockResolvedValue(mockEntry);

      const result = await service.remove('user-1', 'entry-1');
      expect(result.deleted).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('journal:stats:user-1');
    });

    it('throws NotFoundException for missing entry', async () => {
      mockPrisma.journalEntry.findUnique.mockResolvedValue(null);

      await expect(service.remove('user-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getStats / computeStreaks ────────────────────────────────────────────

  describe('getStats', () => {
    it('returns cached stats when present', async () => {
      const cached = { totalCompleted: 5, currentStreak: 3 };
      mockRedis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getStats('user-1');
      expect(result).toEqual(cached);
      expect(mockPrisma.taskSession.findMany).not.toHaveBeenCalled();
    });

    it('computes and caches stats when cache is empty', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrisma.taskSession.findMany.mockResolvedValue([
        { completedAt: toDate(TODAY), task: { category: 'VISUAL' } },
      ]);
      mockPrisma.taskSession.count.mockResolvedValue(2);
      mockPrisma.journalEntry.findMany.mockResolvedValue([{ selfRating: 'SUCCESS' }]);

      const result = await service.getStats('user-1');

      expect(result.totalCompleted).toBe(1);
      expect(result.totalSkipped).toBe(2);
      expect(result.byCategory.VISUAL).toBe(1);
      expect(result.byRating.SUCCESS).toBe(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        'journal:stats:user-1',
        expect.any(String),
        'EX',
        300,
      );
    });
  });

  // ─── computeStreaks edge cases ────────────────────────────────────────────

  describe('computeStreaks', () => {
    it('returns 0/0 for empty sessions', () => {
      expect(service.computeStreaks([])).toEqual({ currentStreak: 0, longestStreak: 0 });
    });

    it('streak = 1 for a single session today', () => {
      const result = service.computeStreaks([{ completedAt: toDate(TODAY) }]);
      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(1);
    });

    it('streak = 1 for a single session yesterday', () => {
      const result = service.computeStreaks([{ completedAt: toDate(YESTERDAY) }]);
      expect(result.currentStreak).toBe(1);
      expect(result.longestStreak).toBe(1);
    });

    it('streak = 0 when last completion was 2+ days ago', () => {
      const result = service.computeStreaks([{ completedAt: toDate('2026-04-05') }]);
      expect(result.currentStreak).toBe(0);
    });

    it('consecutive days produce correct streak', () => {
      const result = service.computeStreaks([
        { completedAt: toDate('2026-04-05') },
        { completedAt: toDate('2026-04-06') },
        { completedAt: toDate(TODAY) },
      ]);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
    });

    it('gap in the middle resets current streak but preserves longest', () => {
      const result = service.computeStreaks([
        { completedAt: toDate('2026-04-01') },
        { completedAt: toDate('2026-04-02') },
        { completedAt: toDate('2026-04-03') },
        // gap on Apr 4
        { completedAt: toDate('2026-04-05') },
        { completedAt: toDate('2026-04-06') },
        { completedAt: toDate(TODAY) },
      ]);
      expect(result.currentStreak).toBe(3);
      expect(result.longestStreak).toBe(3);
    });

    it('multiple sessions on the same day count as one day', () => {
      // Two entries on the same date
      const result = service.computeStreaks([
        { completedAt: toDate(YESTERDAY) },
        { completedAt: new Date(`${YESTERDAY}T18:00:00.000Z`) },
        { completedAt: toDate(TODAY) },
      ]);
      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
    });

    it('SKIPPED sessions (completedAt = null) do not count toward streak', () => {
      const result = service.computeStreaks([
        { completedAt: null }, // SKIPPED on some day
        { completedAt: toDate(TODAY) },
      ]);
      expect(result.currentStreak).toBe(1);
    });

    it('longest streak is correctly found in a longer sequence', () => {
      // 5 days in a row two weeks ago, then nothing until yesterday
      const result = service.computeStreaks([
        { completedAt: toDate('2026-03-20') },
        { completedAt: toDate('2026-03-21') },
        { completedAt: toDate('2026-03-22') },
        { completedAt: toDate('2026-03-23') },
        { completedAt: toDate('2026-03-24') },
        { completedAt: toDate(YESTERDAY) },
        { completedAt: toDate(TODAY) },
      ]);
      expect(result.longestStreak).toBe(5);
      expect(result.currentStreak).toBe(2);
    });

    it('SKIPPED + COMPLETED on the same day still counts that day in streak', () => {
      // Yesterday: only SKIPPED (null) and COMPLETED today
      const result = service.computeStreaks([
        { completedAt: null }, // skipped yesterday (no completedAt)
        { completedAt: toDate(TODAY) },
      ]);
      // Yesterday not in completed dates, so streak is just today
      expect(result.currentStreak).toBe(1);
    });
  });
});
