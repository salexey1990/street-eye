import * as crypto from 'crypto';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedeemPromoDto } from './dto/redeem-promo.dto';
import { GeneratePromoDto } from './dto/generate-promo.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

const PROMO_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function generatePromoCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += PROMO_CHARS[crypto.randomInt(PROMO_CHARS.length)];
  }
  return code;
}

@Injectable()
export class PromoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async redeem(userId: string, dto: RedeemPromoDto) {
    const code = dto.code.toUpperCase().trim();

    const promo = await this.prisma.promoCode.findUnique({ where: { code } });

    if (!promo) {
      throw new NotFoundException('PROMO_CODE_INVALID');
    }

    if (promo.usedById) {
      throw new ConflictException('PROMO_CODE_ALREADY_USED');
    }

    if (promo.expiresAt < new Date()) {
      throw new GoneException('PROMO_CODE_EXPIRED');
    }

    // Check if user already has an active subscription
    const status = await this.subscriptionsService.getStatus(userId);
    if (status.isPremium) {
      throw new ConflictException('ALREADY_PREMIUM');
    }

    await this.prisma.$transaction([
      this.prisma.promoCode.update({
        where: { id: promo.id },
        data: { usedById: userId, usedAt: new Date() },
      }),
      this.prisma.subscription.create({
        data: {
          userId,
          platform: null,
          productId: 'promo_lifetime',
          transactionId: `promo_${promo.id}`,
          receipt: null,
          status: 'ACTIVE',
          expiresAt: new Date('2099-12-31T23:59:59.000Z'),
        },
      }),
    ]);

    return this.subscriptionsService.getStatus(userId);
  }

  async generate(dto: GeneratePromoDto) {
    const codes: string[] = [];
    const expiresAt = new Date(dto.expiresAt);

    for (let i = 0; i < dto.count; i++) {
      let code: string;
      // Ensure uniqueness
      do {
        code = generatePromoCode();
      } while (codes.includes(code));
      codes.push(code);
    }

    await this.prisma.promoCode.createMany({
      data: codes.map((code) => ({ code, expiresAt })),
    });

    return { codes, count: codes.length, expiresAt: expiresAt.toISOString() };
  }

  async list(status?: 'used' | 'available' | 'expired') {
    const where: Record<string, unknown> = {};

    if (status === 'used') {
      where.usedById = { not: null };
    } else if (status === 'available') {
      where.usedById = null;
      where.expiresAt = { gt: new Date() };
    } else if (status === 'expired') {
      where.usedById = null;
      where.expiresAt = { lte: new Date() };
    }

    const promoCodes = await this.prisma.promoCode.findMany({
      where,
      include: { usedBy: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return promoCodes.map((p) => ({
      id: p.id,
      code: p.code,
      usedBy: p.usedBy?.email ?? null,
      usedAt: p.usedAt?.toISOString() ?? null,
      expiresAt: p.expiresAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    }));
  }
}
