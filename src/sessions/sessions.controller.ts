import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Locale } from '../common/decorators/locale.decorator';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsQueryDto } from './dto/sessions-query.dto';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';
const TASK_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const SESSION_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const SESSION_ID_2 = 'd4e5f6a7-b8c9-0123-defa-234567890123';
const STARTED_AT = '2026-03-15T09:30:00.000Z';

const EMBEDDED_TASK = {
  id: TASK_ID,
  title: 'Shadows Only',
  description: 'Find and photograph only shadows — no subjects, just their shadows on surfaces.',
  tip: 'Look for long shadows in the morning or evening when the sun is low.',
  category: 'VISUAL',
  level: 'BEGINNER',
  durationMins: 60,
  tags: ['light', 'shadow', 'abstract'],
};

const SESSION_RESPONSE = {
  id: SESSION_ID,
  status: 'ACTIVE',
  startedAt: STARTED_AT,
  completedAt: null,
  task: EMBEDDED_TASK,
};

@ApiTags('sessions')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', required: false, description: 'Locale: `en` (default) or `ru`' })
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create session',
    description: 'Creates an ACTIVE session for a task when the user taps "Take this task". Only one ACTIVE session is allowed per user at a time.',
  })
  @ApiResponse({
    status: 201,
    description: 'Session created successfully.',
    schema: {
      example: {
        success: true,
        data: SESSION_RESPONSE,
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
    status: 409,
    description: 'User already has an active session.',
    schema: {
      example: {
        success: false,
        error: { code: 'ACTIVE_SESSION_EXISTS', message: 'You already have an active session. Complete or skip it first.', details: [] },
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
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSessionDto,
    @Locale() locale: string,
  ) {
    return this.sessionsService.create(user.sub, dto, locale);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get active session',
    description: 'Returns the current active task session with embedded task details resolved for the requested locale.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active session with embedded task.',
    schema: {
      example: {
        success: true,
        data: SESSION_RESPONSE,
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'No active session.',
    schema: {
      example: {
        success: false,
        error: { code: 'NOT_FOUND', message: 'No active session', details: [] },
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
  getActive(@CurrentUser() user: JwtPayload, @Locale() locale: string) {
    return this.sessionsService.getActive(user.sub, locale);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update session status',
    description: 'Transitions a session: ACTIVE → COMPLETED | SKIPPED | SAVED_FOR_LATER. Cannot modify already closed sessions (COMPLETED or SKIPPED).',
  })
  @ApiParam({ name: 'id', description: 'Session UUID', example: SESSION_ID })
  @ApiResponse({
    status: 200,
    description: 'Session updated with embedded task.',
    schema: {
      example: {
        success: true,
        data: {
          ...SESSION_RESPONSE,
          status: 'COMPLETED',
          completedAt: TIMESTAMP,
        },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status transition (e.g. trying to set ACTIVE).',
    schema: {
      example: {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Cannot set status back to ACTIVE', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Session belongs to another user.',
    schema: {
      example: {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found.',
    schema: {
      example: {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Session not found', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Session is already closed.',
    schema: {
      example: {
        success: false,
        error: { code: 'CONFLICT', message: 'Cannot modify a closed session', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSessionDto,
    @Locale() locale: string,
  ) {
    return this.sessionsService.updateStatus(id, user.sub, dto, locale);
  }

  @Get()
  @ApiOperation({
    summary: 'List sessions (cursor-based)',
    description: "Returns the user's session history with cursor-based pagination. Each session includes the full embedded task resolved for the requested locale.",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated session list with embedded tasks.',
    schema: {
      example: {
        success: true,
        data: {
          items: [
            SESSION_RESPONSE,
            {
              id: SESSION_ID_2,
              status: 'SKIPPED',
              startedAt: '2026-03-14T14:00:00.000Z',
              completedAt: null,
              task: {
                id: 'e5f6a7b8-c9d0-1234-efab-345678901234',
                title: 'Strangers in the City',
                description: 'Photograph strangers in candid moments on the street.',
                tip: 'Smile and ask permission when in doubt.',
                category: 'SOCIAL',
                level: 'INTERMEDIATE',
                durationMins: 90,
                tags: ['people', 'candid', 'street'],
              },
            },
          ],
          nextCursor: null,
          hasMore: false,
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
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: SessionsQueryDto,
    @Locale() locale: string,
  ) {
    return this.sessionsService.findAll(user.sub, query, locale);
  }
}
