import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { VerifyPurchaseDto } from './dto/verify-purchase.dto';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';

const STATUS_EXAMPLE = {
  isPremium: true,
  plan: 'premium',
  expiresAt: '2026-05-01T00:00:00.000Z',
  limits: {
    tasksPerMonth: -1,
    anotherTaskPerSession: 3,
    journalEntriesVisible: -1,
  },
};

@ApiTags('subscriptions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('verify')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Verify in-app purchase',
    description: 'Verifies a receipt from App Store or Google Play and activates the subscription.',
  })
  @ApiResponse({
    status: 200,
    description: 'Purchase verified. Returns updated subscription status.',
    schema: {
      example: { success: true, data: STATUS_EXAMPLE, meta: { timestamp: TIMESTAMP } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid receipt.',
    schema: {
      example: {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid App Store receipt', details: [] },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  verifyPurchase(@CurrentUser() user: JwtPayload, @Body() dto: VerifyPurchaseDto) {
    return this.subscriptionsService.verifyPurchase(user.sub, dto);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get subscription status',
    description: 'Returns current plan, expiration date, and Free/Premium limits.',
  })
  @ApiResponse({
    status: 200,
    description: 'Subscription status.',
    schema: {
      example: { success: true, data: STATUS_EXAMPLE, meta: { timestamp: TIMESTAMP } },
    },
  })
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.getStatus(user.sub);
  }

  @Post('restore')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Restore purchase',
    description: 'Re-verifies the receipt to restore a previously purchased subscription.',
  })
  @ApiResponse({
    status: 200,
    description: 'Purchase restored.',
    schema: {
      example: { success: true, data: STATUS_EXAMPLE, meta: { timestamp: TIMESTAMP } },
    },
  })
  restorePurchase(@CurrentUser() user: JwtPayload, @Body() dto: VerifyPurchaseDto) {
    return this.subscriptionsService.restorePurchase(user.sub, dto);
  }
}
