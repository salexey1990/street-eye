import * as crypto from 'crypto';
import * as fs from 'fs';
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyPurchaseDto } from './dto/verify-purchase.dto';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

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

  private get monetizationEnabled(): boolean {
    return this.config.get<boolean>('MONETIZATION_ENABLED') === true;
  }

  async verifyPurchase(userId: string, dto: VerifyPurchaseDto) {
    if (!this.monetizationEnabled) {
      return this.getStatus(userId);
    }

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

  async getStatus(_userId: string) {
    if (!this.monetizationEnabled) {
      return {
        isPremium: true,
        plan: 'premium' as const,
        expiresAt: null,
        limits: PREMIUM_LIMITS,
      };
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { userId: _userId, status: 'ACTIVE', expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'desc' },
    });

    const isPremium = subscription !== null;

    return {
      isPremium,
      plan: isPremium ? ('premium' as const) : ('free' as const),
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
    const keySource = this.config.get<string>('GOOGLE_SERVICE_ACCOUNT_KEY');
    const packageName = this.config.get<string>('GOOGLE_PLAY_PACKAGE_NAME');

    if (!keySource || !packageName) {
      throw new BadRequestException('Google Play verification is not configured');
    }

    let serviceAccount: ServiceAccount;
    try {
      const raw = keySource.trim().startsWith('{')
        ? keySource
        : fs.readFileSync(keySource, 'utf-8');
      serviceAccount = JSON.parse(raw) as ServiceAccount;
    } catch {
      throw new BadRequestException('Invalid Google service account key configuration');
    }

    const accessToken = await this.getGoogleAccessToken(serviceAccount);

    const url =
      `https://androidpublisher.googleapis.com/androidpublisher/v3/applications` +
      `/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new BadRequestException('Invalid Google Play purchase token');
    }

    const data = (await response.json()) as {
      expiryTimeMillis?: string;
      orderId?: string;
      paymentState?: number;
    };

    if (!data.expiryTimeMillis || !data.orderId) {
      throw new BadRequestException('Invalid Google Play purchase response');
    }

    // paymentState: 1 = purchased, 2 = free trial; 0 = pending, 3 = grace period
    if (data.paymentState !== 1 && data.paymentState !== 2) {
      throw new BadRequestException('Google Play purchase payment not completed');
    }

    return {
      transactionId: data.orderId,
      expiresAt: new Date(Number(data.expiryTimeMillis)),
    };
  }

  private async getGoogleAccessToken(serviceAccount: ServiceAccount): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jwt = this.createJwt(
      {
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/androidpublisher',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      },
      serviceAccount.private_key,
    );

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }).toString(),
    });

    if (!response.ok) {
      throw new BadRequestException('Failed to authenticate with Google Play');
    }

    const data = (await response.json()) as { access_token?: string };
    if (!data.access_token) {
      throw new BadRequestException('Failed to obtain Google Play access token');
    }

    return data.access_token;
  }

  private createJwt(payload: Record<string, unknown>, privateKey: string): string {
    const b64url = (s: string) =>
      Buffer.from(s)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify(payload));
    const signingInput = `${header}.${body}`;

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign
      .sign(privateKey, 'base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${signingInput}.${signature}`;
  }
}
