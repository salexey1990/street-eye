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
  ApiQuery,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Locale } from '../common/decorators/locale.decorator';
import { TasksQueryDto } from './dto/tasks-query.dto';

@ApiTags('tasks')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', required: false, description: 'Locale: en or ru' })
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('random')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Get random task',
    description:
      'Returns a random task matching user level and preferred categories. Excludes the last 5 tasks. Does not create a session.',
  })
  @ApiResponse({ status: 200, description: 'Random task.' })
  @ApiResponse({ status: 404, description: 'No tasks match user filters.' })
  getRandom(@CurrentUser() user: JwtPayload, @Locale() locale: string) {
    return this.tasksService.findRandom(user.sub, locale);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: 200, description: 'Task details.' })
  @ApiResponse({ status: 404, description: 'Task not found.' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Locale() locale: string,
  ) {
    return this.tasksService.findById(id, locale);
  }

  @Get()
  @ApiOperation({ summary: 'List tasks with filters' })
  @ApiQuery({ name: 'level', required: false, enum: ['BEGINNER', 'INTERMEDIATE', 'PRO'] })
  @ApiQuery({ name: 'category', required: false, enum: ['VISUAL', 'TECHNICAL', 'SOCIAL', 'RESTRICTION'] })
  @ApiQuery({ name: 'tags', required: false, description: 'Comma-separated tags' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of tasks.' })
  findAll(@Query() query: TasksQueryDto, @Locale() locale: string) {
    return this.tasksService.findAll(query, locale);
  }
}
