import {
  Controller,
  Post,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { SavePushTokenDto } from './dto/save-push-token.dto';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Save or update push token',
    description: 'Saves an Expo push token for the current device. Call on login or when the app obtains a push token.',
  })
  @ApiResponse({ status: 204, description: 'Push token saved.' })
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
  savePushToken(@CurrentUser() user: JwtPayload, @Body() dto: SavePushTokenDto) {
    return this.notificationsService.savePushToken(user.sub, dto);
  }

  @Delete('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete push token',
    description: 'Removes the push token on logout so the device stops receiving notifications.',
  })
  @ApiResponse({ status: 204, description: 'Push token deleted.' })
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
  deletePushToken(@CurrentUser() user: JwtPayload, @Query('token') token: string) {
    return this.notificationsService.deletePushToken(user.sub, token);
  }
}
