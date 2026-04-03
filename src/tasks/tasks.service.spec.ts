import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';

const mockTask = {
  id: 'task-1',
  title_ru: 'Только тени',
  title_en: 'Shadows Only',
  description_ru: 'Описание на русском',
  description_en: 'Description in English',
  tip_ru: 'Совет на русском',
  tip_en: 'Tip in English',
  category: 'VISUAL' as const,
  level: 'BEGINNER' as const,
  durationMins: 60,
  tags: ['light', 'shadow'],
  isActive: true,
  createdAt: new Date(),
};

const mockUser = {
  level: 'BEGINNER' as const,
  preferredCategories: ['VISUAL', 'TECHNICAL'],
};

const mockPrisma = {
  user: {
    findUniqueOrThrow: jest.fn().mockResolvedValue(mockUser),
  },
  task: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  taskSession: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
    jest.clearAllMocks();
  });

  describe('toDto', () => {
    it('should return English fields when locale is en', () => {
      const dto = service.toDto(mockTask, 'en');
      expect(dto.title).toBe('Shadows Only');
      expect(dto.description).toBe('Description in English');
      expect(dto.tip).toBe('Tip in English');
      expect(dto).not.toHaveProperty('title_ru');
      expect(dto).not.toHaveProperty('title_en');
    });

    it('should return Russian fields when locale is ru', () => {
      const dto = service.toDto(mockTask, 'ru');
      expect(dto.title).toBe('Только тени');
      expect(dto.description).toBe('Описание на русском');
      expect(dto.tip).toBe('Совет на русском');
    });

    it('should default to English for unknown locale', () => {
      const dto = service.toDto(mockTask, 'fr');
      expect(dto.title).toBe('Shadows Only');
    });
  });

  describe('findRandom', () => {
    it('should return a random task without creating a session', async () => {
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findRandom('user-1', 'en');

      expect(result.title).toBe('Shadows Only');
      expect(result).not.toHaveProperty('sessionId');
    });

    it('should exclude last 5 tasks from recent sessions', async () => {
      mockPrisma.taskSession.findMany.mockResolvedValue([
        { taskId: 'recent-1' },
        { taskId: 'recent-2' },
      ]);
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      await service.findRandom('user-1', 'en');

      expect(mockPrisma.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { notIn: ['recent-1', 'recent-2'] },
          }),
        }),
      );
    });

    it('should retry without exclusion filter when all tasks seen', async () => {
      mockPrisma.taskSession.findMany.mockResolvedValue([
        { taskId: 'recent-1' },
      ]);
      mockPrisma.task.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findRandom('user-1', 'en');
      expect(result.title).toBe('Shadows Only');
      expect(mockPrisma.task.count).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when no tasks exist', async () => {
      mockPrisma.task.count.mockResolvedValue(0);
      mockPrisma.taskSession.findMany.mockResolvedValue([]);

      await expect(service.findRandom('user-1', 'en')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should use preferredCategories from user profile', async () => {
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      await service.findRandom('user-1', 'en');

      expect(mockPrisma.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: { in: ['VISUAL', 'TECHNICAL'] },
          }),
        }),
      );
    });

    it('should skip category filter when preferredCategories is empty', async () => {
      mockPrisma.user.findUniqueOrThrow.mockResolvedValueOnce({
        level: 'BEGINNER',
        preferredCategories: [],
      });
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      await service.findRandom('user-1', 'en');

      expect(mockPrisma.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            category: expect.anything(),
          }),
        }),
      );
    });
  });

  describe('findRandomGuest', () => {
    it('should return a task matching provided filters without user auth', async () => {
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findRandomGuest({
        level: 'BEGINNER',
        categories: ['VISUAL'],
        locale: 'EN',
      });

      expect(result.title).toBe('Shadows Only');
      expect(mockPrisma.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            level: 'BEGINNER',
            category: { in: ['VISUAL'] },
          }),
        }),
      );
    });

    it('should resolve locale from query parameter, not Accept-Language', async () => {
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      const result = await service.findRandomGuest({
        level: 'BEGINNER',
        categories: ['VISUAL'],
        locale: 'RU',
      });

      expect(result.title).toBe('Только тени');
      expect(result.description).toBe('Описание на русском');
    });

    it('should not exclude recent tasks (guest has no history)', async () => {
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      await service.findRandomGuest({
        level: 'BEGINNER',
        categories: ['VISUAL'],
        locale: 'EN',
      });

      expect(mockPrisma.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ id: expect.anything() }),
        }),
      );
      // Confirm no session queries were made
      expect(mockPrisma.taskSession.findMany).not.toHaveBeenCalled();
    });

    it('should support multiple categories', async () => {
      mockPrisma.task.count.mockResolvedValue(1);
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);

      await service.findRandomGuest({
        level: 'INTERMEDIATE',
        categories: ['VISUAL', 'SOCIAL'],
        locale: 'EN',
      });

      expect(mockPrisma.task.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: { in: ['VISUAL', 'SOCIAL'] },
            level: 'INTERMEDIATE',
          }),
        }),
      );
    });

    it('should throw NotFoundException when no tasks match filters', async () => {
      mockPrisma.task.count.mockResolvedValue(0);

      await expect(
        service.findRandomGuest({
          level: 'PRO',
          categories: ['RESTRICTION'],
          locale: 'EN',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should return localized task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(mockTask);
      const result = await service.findById('task-1', 'ru');
      expect(result.title).toBe('Только тени');
    });

    it('should throw NotFoundException for missing task', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);
      await expect(service.findById('bad-id', 'en')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated tasks with filters', async () => {
      mockPrisma.task.findMany.mockResolvedValue([mockTask]);
      mockPrisma.task.count.mockResolvedValue(1);

      const result = await service.findAll(
        { level: 'BEGINNER', page: 1, limit: 20 },
        'en',
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Shadows Only');
      expect(result.total).toBe(1);
    });

    it('should filter by tags', async () => {
      mockPrisma.task.findMany.mockResolvedValue([]);
      mockPrisma.task.count.mockResolvedValue(0);

      await service.findAll({ tags: ['shadow'], page: 1, limit: 20 }, 'en');

      expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tags: { hasSome: ['shadow'] },
          }),
        }),
      );
    });
  });
});
