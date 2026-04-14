import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { SessionStatus } from '@prisma/client';
import { SessionsService } from './sessions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { BadgesService } from '../badges/badges.service';

const mockTask = {
  id: 'task-1',
  title_ru: 'Тени',
  title_en: 'Shadows',
  description_ru: 'Описание',
  description_en: 'Description',
  tip_ru: 'Совет',
  tip_en: 'Tip',
  category: 'VISUAL' as const,
  level: 'BEGINNER' as const,
  durationMins: 60,
  tags: ['shadow'],
  isActive: true,
  createdAt: new Date(),
};

const now = new Date();

const mockActiveSession = {
  id: 'session-1',
  userId: 'user-1',
  taskId: 'task-1',
  status: 'ACTIVE' as const,
  startedAt: now,
  completedAt: null,
  task: mockTask,
};

const mockPrisma = {
  task: {
    findUnique: jest.fn(),
  },
  taskSession: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

const mockBadgesService = {
  checkAndAward: jest.fn().mockResolvedValue(undefined),
};

const mockTasksService = {
  toDto: jest.fn().mockImplementation((task, locale) => ({
    id: task.id,
    title: locale === 'ru' ? task.title_ru : task.title_en,
    description: locale === 'ru' ? task.description_ru : task.description_en,
    tip: locale === 'ru' ? task.tip_ru : task.tip_en,
    category: task.category,
    level: task.level,
    durationMins: task.durationMins,
    tags: task.tags,
  })),
};

describe('SessionsService', () => {
  let service: SessionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: BadgesService, useValue: mockBadgesService },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a session with embedded task', async () => {
      mockPrisma.taskSession.findFirst.mockResolvedValue(null);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.taskSession.create.mockResolvedValue({
        id: 'session-new',
        userId: 'user-1',
        taskId: 'task-1',
        status: 'ACTIVE' as SessionStatus,
        startedAt: now,
        completedAt: null,
        task: mockTask,
      });

      const result = await service.create('user-1', { taskId: 'task-1' }, 'en');

      expect(result.id).toBe('session-new');
      expect(result.status).toBe('ACTIVE');
      expect(result.task.id).toBe('task-1');
      expect(result.task.title).toBe('Shadows');
      expect(result.completedAt).toBeNull();
      expect(mockPrisma.taskSession.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', taskId: 'task-1', status: 'ACTIVE' },
        include: { task: true },
      });
    });

    it('should return localized task on create', async () => {
      mockPrisma.taskSession.findFirst.mockResolvedValue(null);
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      mockPrisma.taskSession.create.mockResolvedValue({
        id: 'session-new',
        userId: 'user-1',
        taskId: 'task-1',
        status: 'ACTIVE' as SessionStatus,
        startedAt: now,
        completedAt: null,
        task: mockTask,
      });

      const result = await service.create('user-1', { taskId: 'task-1' }, 'ru');

      expect(result.task.title).toBe('Тени');
    });

    it('should throw ConflictException if active session exists', async () => {
      mockPrisma.taskSession.findFirst.mockResolvedValue(mockActiveSession);

      await expect(
        service.create('user-1', { taskId: 'task-1' }, 'en'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if task does not exist', async () => {
      mockPrisma.taskSession.findFirst.mockResolvedValue(null);
      mockPrisma.task.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', { taskId: 'bad-id' }, 'en'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActive', () => {
    it('should return active session with embedded localized task', async () => {
      mockPrisma.taskSession.findFirst.mockResolvedValue(mockActiveSession);

      const result = await service.getActive('user-1', 'en');

      expect(result.id).toBe('session-1');
      expect(result.status).toBe('ACTIVE');
      expect(result.task.id).toBe('task-1');
      expect(result.task.title).toBe('Shadows');
      expect(mockPrisma.taskSession.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'ACTIVE' },
        include: { task: true },
      });
    });

    it('should return ru locale task', async () => {
      mockPrisma.taskSession.findFirst.mockResolvedValue(mockActiveSession);

      const result = await service.getActive('user-1', 'ru');

      expect(result.task.title).toBe('Тени');
    });

    it('should throw NotFoundException when no active session', async () => {
      mockPrisma.taskSession.findFirst.mockResolvedValue(null);

      await expect(service.getActive('user-1', 'en')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should complete a session and return embedded task', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(mockActiveSession);
      mockPrisma.taskSession.update.mockResolvedValue({
        ...mockActiveSession,
        status: 'COMPLETED',
        completedAt: now,
      });

      const result = await service.updateStatus('session-1', 'user-1', {
        status: 'COMPLETED',
      }, 'en');

      expect(result.status).toBe('COMPLETED');
      expect(result.completedAt).toBeDefined();
      expect(result.task.id).toBe('task-1');
      expect(mockPrisma.taskSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: 'COMPLETED', completedAt: expect.any(Date) },
        include: { task: true },
      });
    });

    it('should skip a session without setting completedAt', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(mockActiveSession);
      mockPrisma.taskSession.update.mockResolvedValue({
        ...mockActiveSession,
        status: 'SKIPPED',
      });

      const result = await service.updateStatus('session-1', 'user-1', {
        status: 'SKIPPED',
      }, 'en');

      expect(result.status).toBe('SKIPPED');
      expect(result.completedAt).toBeNull();
      expect(mockPrisma.taskSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { status: 'SKIPPED' },
        include: { task: true },
      });
    });

    it('should save session for later', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(mockActiveSession);
      mockPrisma.taskSession.update.mockResolvedValue({
        ...mockActiveSession,
        status: 'SAVED_FOR_LATER',
      });

      const result = await service.updateStatus('session-1', 'user-1', {
        status: 'SAVED_FOR_LATER',
      }, 'en');

      expect(result.status).toBe('SAVED_FOR_LATER');
    });

    it('should throw NotFoundException for missing session', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('bad-id', 'user-1', { status: 'COMPLETED' }, 'en'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for another user session', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(mockActiveSession);

      await expect(
        service.updateStatus('session-1', 'other-user', {
          status: 'COMPLETED',
        }, 'en'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException when session is already completed', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue({
        ...mockActiveSession,
        status: 'COMPLETED',
      });

      await expect(
        service.updateStatus('session-1', 'user-1', { status: 'SKIPPED' }, 'en'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when session is already skipped', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue({
        ...mockActiveSession,
        status: 'SKIPPED',
      });

      await expect(
        service.updateStatus('session-1', 'user-1', {
          status: 'COMPLETED',
        }, 'en'),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when trying to set ACTIVE', async () => {
      mockPrisma.taskSession.findUnique.mockResolvedValue(mockActiveSession);

      await expect(
        service.updateStatus('session-1', 'user-1', { status: 'ACTIVE' }, 'en'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return cursor-paginated sessions with embedded tasks', async () => {
      const sessions = [
        { ...mockActiveSession, id: 's-1', status: 'COMPLETED', completedAt: now },
        { ...mockActiveSession, id: 's-2' },
      ];
      mockPrisma.taskSession.findMany.mockResolvedValue(sessions);

      const result = await service.findAll('user-1', { limit: 20 }, 'en');

      expect(result.items).toHaveLength(2);
      expect(result.items[0].task.id).toBe('task-1');
      expect(result.items[0].task.title).toBe('Shadows');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should detect hasMore when more items exist', async () => {
      const sessions = Array.from({ length: 3 }, (_, i) => ({
        ...mockActiveSession,
        id: `s-${i}`,
      }));
      mockPrisma.taskSession.findMany.mockResolvedValue(sessions);

      const result = await service.findAll('user-1', { limit: 2 }, 'en');

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('s-1');
    });

    it('should filter by status', async () => {
      mockPrisma.taskSession.findMany.mockResolvedValue([]);

      await service.findAll('user-1', { status: 'COMPLETED', limit: 20 }, 'en');

      expect(mockPrisma.taskSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', status: 'COMPLETED' },
          include: { task: true },
        }),
      );
    });
  });
});
