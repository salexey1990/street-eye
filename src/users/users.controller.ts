import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';
const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns full profile including locale, level, preferred categories, and aggregated stats (total completed, streak, badges).',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile.',
    schema: {
      example: {
        success: true,
        data: {
          id: USER_ID,
          email: 'user@example.com',
          isEmailVerified: true,
          locale: 'EN',
          level: 'BEGINNER',
          preferredCategories: ['VISUAL', 'SOCIAL'],
          createdAt: '2026-03-01T08:00:00.000Z',
          isPremium: false,
          subscriptionExpiresAt: null,
          stats: { totalCompleted: 5, currentStreak: 3, badgesEarned: 2 },
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
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getProfileWithStats(user.sub);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update profile',
    description: 'Updates level, preferred categories, or locale. All fields are optional — only provided fields are changed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Updated user record.',
    schema: {
      example: {
        success: true,
        data: {
          id: USER_ID,
          email: 'user@example.com',
          isEmailVerified: true,
          locale: 'RU',
          level: 'INTERMEDIATE',
          preferredCategories: ['VISUAL', 'TECHNICAL'],
          createdAt: '2026-03-01T08:00:00.000Z',
          isPremium: false,
          subscriptionExpiresAt: null,
          stats: { totalCompleted: 5, currentStreak: 3, badgesEarned: 2 },
        },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error (invalid enum, empty categories array, etc.).',
    schema: {
      example: {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [{ field: 'level', message: 'level must be one of: BEGINNER, INTERMEDIATE, PRO' }],
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
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Change password',
    description: 'Requires the current password. On success, all existing refresh tokens are invalidated — user must log in again on other devices.',
  })
  @ApiResponse({ status: 204, description: 'Password changed successfully.' })
  @ApiResponse({
    status: 400,
    description: 'Current password incorrect or new password too short.',
    schema: {
      example: {
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect', details: [] },
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
  changePassword(@CurrentUser() user: JwtPayload, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.sub, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete account',
    description: 'Permanently deletes the account and all associated data (sessions, journal entries, badges). This action is irreversible.',
  })
  @ApiResponse({ status: 204, description: 'Account deleted.' })
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
  deleteAccount(@CurrentUser() user: JwtPayload) {
    return this.usersService.delete(user.sub);
  }
}
