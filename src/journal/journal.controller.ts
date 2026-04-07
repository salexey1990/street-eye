import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { JournalService } from './journal.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { JournalQueryDto } from './dto/journal-query.dto';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';
const ENTRY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const SESSION_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

const ENTRY_RESPONSE = {
  id: ENTRY_ID,
  sessionId: SESSION_ID,
  category: 'VISUAL',
  level: 'BEGINNER',
  note: 'Great light today, caught some amazing shadows.',
  selfRating: 'SUCCESS',
  hasPhoto: true,
  createdAt: TIMESTAMP,
  updatedAt: TIMESTAMP,
};

@ApiTags('journal')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', required: false, description: 'Locale: `en` (default) or `ru`' })
@UseGuards(JwtAuthGuard)
@Controller('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Post()
  @ApiOperation({
    summary: 'Create journal entry',
    description: 'Creates a journal entry for a COMPLETED session. One entry per session.',
  })
  @ApiResponse({
    status: 201,
    description: 'Entry created.',
    schema: { example: { success: true, data: ENTRY_RESPONSE, meta: { timestamp: TIMESTAMP } } },
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
    description: 'Session is not COMPLETED or entry already exists.',
    schema: {
      example: {
        success: false,
        error: { code: 'CONFLICT', message: 'Session must be COMPLETED to create a journal entry', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateJournalEntryDto) {
    return this.journalService.create(user.sub, dto);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Journal statistics',
    description: 'Aggregated stats: total completed/skipped, streak, per-category and per-rating counts. Cached in Redis for 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistics.',
    schema: {
      example: {
        success: true,
        data: {
          totalCompleted: 12,
          totalSkipped: 3,
          currentStreak: 4,
          longestStreak: 7,
          byCategory: { VISUAL: 5, TECHNICAL: 3, SOCIAL: 2, RESTRICTION: 2 },
          byRating: { SUCCESS: 8, PARTIAL: 3, FAILED: 1 },
        },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  getStats(@CurrentUser() user: JwtPayload) {
    return this.journalService.getStats(user.sub);
  }

  @Get()
  @ApiOperation({
    summary: 'List journal entries (cursor-based)',
    description: 'Returns the user\'s journal entries with optional filters and cursor-based pagination.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated journal entries.',
    schema: {
      example: {
        success: true,
        data: {
          items: [ENTRY_RESPONSE],
          nextCursor: null,
          hasMore: false,
        },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: JournalQueryDto) {
    return this.journalService.findAll(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get journal entry by ID' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID', example: ENTRY_ID })
  @ApiResponse({
    status: 200,
    description: 'Journal entry.',
    schema: { example: { success: true, data: ENTRY_RESPONSE, meta: { timestamp: TIMESTAMP } } },
  })
  @ApiResponse({
    status: 404,
    description: 'Entry not found.',
    schema: {
      example: {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Journal entry not found', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Entry belongs to another user.',
    schema: {
      example: {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Forbidden resource', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.journalService.findOne(user.sub, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update journal entry', description: 'Update note, selfRating, or hasPhoto.' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID', example: ENTRY_ID })
  @ApiResponse({
    status: 200,
    description: 'Entry updated.',
    schema: { example: { success: true, data: ENTRY_RESPONSE, meta: { timestamp: TIMESTAMP } } },
  })
  @ApiResponse({ status: 404, description: 'Entry not found.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalEntryDto,
  ) {
    return this.journalService.update(user.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete journal entry' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID', example: ENTRY_ID })
  @ApiResponse({
    status: 200,
    description: 'Entry deleted.',
    schema: {
      example: { success: true, data: { deleted: true }, meta: { timestamp: TIMESTAMP } },
    },
  })
  @ApiResponse({ status: 404, description: 'Entry not found.' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.journalService.remove(user.sub, id);
  }
}
