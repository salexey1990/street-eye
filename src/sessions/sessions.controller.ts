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
  ApiQuery,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Locale } from '../common/decorators/locale.decorator';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsQueryDto } from './dto/sessions-query.dto';

@ApiTags('sessions')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', required: false, description: 'Locale: en or ru' })
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create session',
    description: 'Creates an ACTIVE session for a task. Fails if user already has an ACTIVE session.',
  })
  @ApiResponse({ status: 201, description: 'Session created.' })
  @ApiResponse({ status: 404, description: 'Task not found.' })
  @ApiResponse({ status: 409, description: 'Active session already exists.' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSessionDto) {
    return this.sessionsService.create(user.sub, dto);
  }

  @Get('active')
  @ApiOperation({
    summary: 'Get active session',
    description: 'Returns the current active task session with task details, or 404 if none.',
  })
  @ApiResponse({ status: 200, description: 'Active session with task.' })
  @ApiResponse({ status: 404, description: 'No active session.' })
  getActive(@CurrentUser() user: JwtPayload, @Locale() locale: string) {
    return this.sessionsService.getActive(user.sub, locale);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update session status',
    description: 'Transition session: ACTIVE → COMPLETED | SKIPPED | SAVED_FOR_LATER. Cannot modify closed sessions.',
  })
  @ApiResponse({ status: 200, description: 'Updated session.' })
  @ApiResponse({ status: 400, description: 'Invalid status transition.' })
  @ApiResponse({ status: 404, description: 'Session not found.' })
  @ApiResponse({ status: 409, description: 'Session already closed.' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.updateStatus(id, user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List sessions (cursor-based)' })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'COMPLETED', 'SKIPPED', 'SAVED_FOR_LATER'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, description: 'Session ID for cursor pagination' })
  @ApiResponse({ status: 200, description: 'Paginated session list.' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: SessionsQueryDto) {
    return this.sessionsService.findAll(user.sub, query);
  }
}
