import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Locale } from '../common/decorators/locale.decorator';
import { TasksQueryDto } from './dto/tasks-query.dto';
import { GuestRandomTaskQueryDto } from './dto/guest-random-task-query.dto';
import { Public } from '../common/decorators/public.decorator';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';
const TASK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

const TASK_EXAMPLE = {
  id: TASK_ID,
  title: 'Shadows Only',
  description: 'Find and photograph only shadows — no subjects, just their shadows on surfaces.',
  tip: 'Look for long shadows in the morning or evening when the sun is low.',
  category: 'VISUAL',
  level: 'BEGINNER',
  durationMins: 60,
  tags: ['light', 'shadow', 'abstract'],
};

@ApiTags('tasks')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', required: false, description: 'Locale: `en` (default) or `ru`' })
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('random')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Get random task',
    description: 'Returns a random task matching user level and preferred categories. Excludes the last 5 tasks. Does not create a session — call POST /sessions to start.',
  })
  @ApiResponse({
    status: 200,
    description: 'A random task in the requested locale.',
    schema: {
      example: {
        success: true,
        data: TASK_EXAMPLE,
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No tasks match user filters.',
    schema: {
      example: {
        success: false,
        error: { code: 'NOT_FOUND', message: 'No tasks available for your filters', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Access token is missing or invalid', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  getRandom(@CurrentUser() user: JwtPayload, @Locale() locale: string) {
    return this.tasksService.findRandom(user.sub, locale);
  }

  @Get('random/guest')
  @Public()
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @ApiOperation({
    summary: 'Get random task for guest (onboarding)',
    description:
      'Public endpoint for onboarding step 6 — shown before registration. ' +
      'Returns a random task matching provided filters. Does not create a session.\n\n' +
      'Rate limit: **5 requests / 15 min per IP** (stricter than authenticated endpoint).',
  })
  @ApiQuery({ name: 'level', enum: ['BEGINNER', 'INTERMEDIATE', 'PRO'], required: true })
  @ApiQuery({ name: 'categories', enum: ['VISUAL', 'TECHNICAL', 'SOCIAL', 'RESTRICTION'], isArray: true, required: true, description: '1–2 categories' })
  @ApiQuery({ name: 'locale', enum: ['EN', 'RU'], required: true })
  @ApiResponse({
    status: 200,
    description: 'A random task in the requested locale.',
    schema: {
      example: {
        success: true,
        data: TASK_EXAMPLE,
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error.',
    schema: {
      example: {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded.',
    schema: {
      example: {
        success: false,
        error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  getRandomGuest(@Query() query: GuestRandomTaskQueryDto) {
    return this.tasksService.findRandomGuest(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get task by ID',
    description: 'Returns a specific task by its ID in the requested locale. Used to restore an active session on app restart.',
  })
  @ApiParam({ name: 'id', description: 'Task UUID', example: TASK_ID })
  @ApiResponse({
    status: 200,
    description: 'Task details.',
    schema: {
      example: {
        success: true,
        data: TASK_EXAMPLE,
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found.',
    schema: {
      example: {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Task not found', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Access token is missing or invalid', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Locale() locale: string,
  ) {
    return this.tasksService.findById(id, locale);
  }

  @Get()
  @ApiOperation({
    summary: 'List tasks with filters',
    description: 'Returns a paginated list of active tasks. Supports filtering by level, category, and tags. Useful for browsing the task library.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of tasks.',
    schema: {
      example: {
        success: true,
        data: {
          items: [
            TASK_EXAMPLE,
            {
              id: 'd4e5f6a7-b8c9-0123-defa-234567890123',
              title: 'Strangers',
              description: 'Approach and photograph at least one stranger with their permission.',
              tip: 'Smile first, explain you are doing a photography challenge.',
              category: 'SOCIAL',
              level: 'INTERMEDIATE',
              durationMins: 90,
              tags: ['people', 'portrait', 'social'],
            },
          ],
          total: 30,
          page: 1,
          limit: 20,
        },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
    schema: {
      example: {
        success: false,
        error: { code: 'TOKEN_INVALID', message: 'Access token is missing or invalid', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  findAll(@Query() query: TasksQueryDto, @Locale() locale: string) {
    return this.tasksService.findAll(query, locale);
  }
}
