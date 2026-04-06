import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { PromoService } from './promo.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminKeyGuard } from '../common/guards/admin-key.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RedeemPromoDto } from './dto/redeem-promo.dto';
import { GeneratePromoDto } from './dto/generate-promo.dto';

const TIMESTAMP = '2026-03-15T10:00:00.000Z';

const STATUS_EXAMPLE = {
  isPremium: true,
  plan: 'premium',
  expiresAt: '2099-12-31T23:59:59.000Z',
  limits: {
    tasksPerMonth: -1,
    anotherTaskPerSession: 3,
    journalEntriesVisible: -1,
  },
};

const PROMO_CODE_EXAMPLE = {
  id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  code: 'K7X2NP4G',
  usedBy: null,
  usedAt: null,
  expiresAt: '2026-12-31T23:59:59.000Z',
  createdAt: '2026-04-01T12:00:00.000Z',
};

const PROMO_CODE_USED_EXAMPLE = {
  id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
  code: 'M3L8YR5W',
  usedBy: 'user@example.com',
  usedAt: '2026-04-05T15:30:00.000Z',
  expiresAt: '2026-12-31T23:59:59.000Z',
  createdAt: '2026-04-01T12:00:00.000Z',
};

const errorExample = (code: string, message: string) => ({
  success: false,
  error: { code, message, details: [] },
  meta: { timestamp: TIMESTAMP },
});

@ApiTags('promo')
@Controller('promo')
export class PromoController {
  constructor(private readonly promoService: PromoService) {}

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 900000, limit: 5 } })
  @ApiOperation({
    summary: 'Redeem a promo code',
    description: 'Activates a promo code and grants lifetime Premium subscription.',
  })
  @ApiResponse({
    status: 200,
    description: 'Promo code redeemed. Returns updated subscription status.',
    schema: {
      example: { success: true, data: STATUS_EXAMPLE, meta: { timestamp: TIMESTAMP } },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Promo code does not exist.',
    schema: { example: errorExample('PROMO_CODE_INVALID', 'PROMO_CODE_INVALID') },
  })
  @ApiResponse({
    status: 409,
    description: 'Code already used or user already premium.',
    schema: {
      examples: [
        errorExample('PROMO_CODE_ALREADY_USED', 'PROMO_CODE_ALREADY_USED'),
        errorExample('ALREADY_PREMIUM', 'ALREADY_PREMIUM'),
      ],
    },
  })
  @ApiResponse({
    status: 410,
    description: 'Promo code expired.',
    schema: { example: errorExample('PROMO_CODE_EXPIRED', 'PROMO_CODE_EXPIRED') },
  })
  redeem(@CurrentUser() user: JwtPayload, @Body() dto: RedeemPromoDto) {
    return this.promoService.redeem(user.sub, dto);
  }

  @Post('generate')
  @Public()
  @UseGuards(AdminKeyGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Generate promo codes (admin)',
    description: 'Creates N promo codes. Requires X-Admin-Key header.',
  })
  @ApiHeader({ name: 'X-Admin-Key', description: 'Admin API key', required: true })
  @ApiResponse({
    status: 201,
    description: 'Promo codes generated.',
    schema: {
      example: {
        success: true,
        data: { codes: ['K7X2NP4G', 'M3L8YR5W'], count: 2, expiresAt: '2026-12-31T23:59:59.000Z' },
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid admin API key.',
    schema: { example: errorExample('TOKEN_INVALID', 'Invalid or missing admin API key') },
  })
  generate(@Body() dto: GeneratePromoDto) {
    return this.promoService.generate(dto);
  }

  @Get('list')
  @Public()
  @UseGuards(AdminKeyGuard)
  @ApiOperation({
    summary: 'List promo codes (admin)',
    description: 'Returns all promo codes with optional status filter. Requires X-Admin-Key header.',
  })
  @ApiHeader({ name: 'X-Admin-Key', description: 'Admin API key', required: true })
  @ApiQuery({ name: 'status', required: false, enum: ['used', 'available', 'expired'] })
  @ApiResponse({
    status: 200,
    description: 'List of promo codes.',
    schema: {
      example: {
        success: true,
        data: [PROMO_CODE_EXAMPLE, PROMO_CODE_USED_EXAMPLE],
        meta: { timestamp: TIMESTAMP },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid admin API key.',
    schema: { example: errorExample('TOKEN_INVALID', 'Invalid or missing admin API key') },
  })
  list(@Query('status') status?: 'used' | 'available' | 'expired') {
    return this.promoService.list(status);
  }
}
