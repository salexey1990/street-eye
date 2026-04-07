import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { BadgesService } from './badges.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';

const BADGE_EXAMPLE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  key: 'FIRST_STEP',
  name: 'First Step',
  description: 'Complete your first assignment',
  earned: true,
  earnedAt: TIMESTAMP,
};

@ApiTags('badges')
@ApiBearerAuth('access-token')
@ApiHeader({ name: 'Accept-Language', required: false, description: 'Locale: `en` (default) or `ru`' })
@UseGuards(JwtAuthGuard)
@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}

  @Get()
  @ApiOperation({
    summary: 'All badges',
    description: 'Returns all 4 badges with earned/not earned status for the current user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Badge list.',
    schema: {
      example: {
        success: true,
        data: [
          BADGE_EXAMPLE,
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            key: 'WEEK',
            name: 'Week',
            description: 'Complete 7 assignments',
            earned: false,
            earnedAt: null,
          },
        ],
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.badgesService.findAll(user.sub);
  }

  @Get('earned')
  @ApiOperation({
    summary: 'Earned badges',
    description: 'Returns only the badges the current user has earned, with date received.',
  })
  @ApiResponse({
    status: 200,
    description: 'Earned badges.',
    schema: {
      example: {
        success: true,
        data: [{ ...BADGE_EXAMPLE, earnedAt: TIMESTAMP }],
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  findEarned(@CurrentUser() user: JwtPayload) {
    return this.badgesService.findEarned(user.sub);
  }
}
