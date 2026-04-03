import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyPurchaseDto } from './dto/verify-purchase.dto';

const FREE_LIMITS = {
  tasksPerMonth: 10,
  anotherTaskPerSession: 1,
  journalEntriesVisible: 10,
};

const PREMIUM_LIMITS = {
  tasksPerMonth: -1,
  anotherTaskPerSession: 3,
  journalEntriesVisible: -1,
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async verifyPurchase(userId: string, dto: VerifyPurchaseDto) {
    let expiresAt: Date;
    let transactionId: string;

    if (dto.platform === 'IOS') {
      const result = await this.verifyAppleReceipt(dto.receipt);
      expiresAt = result.expiresAt;
      transactionId = result.transactionId;
    } else {
      const result = await this.verifyGoogleReceipt(dto.receipt, dto.productId);
      expiresAt = result.expiresAt;
      transactionId = result.transactionId;
    }

    await this.prisma.subscription.upsert({
      where: { transactionId },
      update: { status: 'ACTIVE', expiresAt },
      create: {
        userId,
        platform: dto.platform,
        productId: dto.productId,
        transactionId,
        receipt: dto.receipt,
        status: 'ACTIVE',
        expiresAt,
      },
    });

    return this.getStatus(userId);
  }

  async getStatus(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });

    const isPremium = subscription !== null;

    return {
      isPremium,
      plan: isPremium ? 'premium' : 'free',
      expiresAt: subscription?.expiresAt.toISOString() ?? null,
      limits: isPremium ? PREMIUM_LIMITS : FREE_LIMITS,
    };
  }

  async restorePurchase(userId: string, dto: VerifyPurchaseDto) {
    return this.verifyPurchase(userId, dto);
  }

  private async verifyAppleReceipt(receipt: string): Promise<{ expiresAt: Date; transactionId: string }> {
    const sharedSecret = this.config.get<string>('APPLE_SHARED_SECRET');
    let url = 'https://buy.itunes.apple.com/verifyReceipt';

    let response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'receipt-data': receipt, password: sharedSecret }),
    });
    let data: any = await response.json();

    // Retry with sandbox if environment is sandbox
    if (data.status === 21007) {
      url = 'https://sandbox.itunes.apple.com/verifyReceipt';
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'receipt-data': receipt, password: sharedSecret }),
      });
      data = await response.json();
    }

    if (data.status !== 0) {
      throw new BadRequestException('Invalid App Store receipt');
    }

    const latestReceipt = data.latest_receipt_info?.[0];
    if (!latestReceipt) throw new BadRequestException('No receipt info found');

    return {
      transactionId: latestReceipt.transaction_id,
      expiresAt: new Date(Number(latestReceipt.expires_date_ms)),
    };
  }

  private async verifyGoogleReceipt(
    purchaseToken: string,
    productId: string,
  ): Promise<{ expiresAt: Date; transactionId: string }> {
    // Google Play Developer API verification
    // Requires service account credentials configured via GOOGLE_SERVICE_ACCOUNT_KEY
    this.logger.warn('Google Play receipt verification is not yet fully implemented');
    throw new BadRequestException('Google Play verification not yet available');
  }
}
