import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerifyDto } from './dto/resend-verify.dto';
import { EmailTokenType } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto, locale: 'en' | 'ru' = 'en') {
    const user = await this.usersService.create(dto.email, dto.password, {
      level: dto.level,
      preferredCategories: dto.preferredCategories,
      locale: dto.locale,
    });

    const token = await this.createEmailToken(user.id, 'VERIFY_EMAIL', 24 * 60 * 60);
    await this.mailService.sendVerifyEmail(user.email, token, locale);

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const record = await this.findAndValidateEmailToken(dto.token, 'VERIFY_EMAIL');

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      }),
      this.prisma.emailToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Email verified successfully.' };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('INVALID_CREDENTIALS');

    if (!user.isEmailVerified) {
      throw new ForbiddenException('EMAIL_NOT_VERIFIED');
    }

    return this.issueTokenPair(user.id, user.email);
  }

  async refresh(dto: RefreshDto) {
    const records = await this.prisma.refreshToken.findMany({
      where: {
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    // Find matching token by comparing bcrypt hash
    let matched: (typeof records)[number] | undefined;
    for (const record of records) {
      const ok = await bcrypt.compare(dto.refreshToken, record.tokenHash);
      if (ok) {
        matched = record;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('TOKEN_INVALID');
    }

    // Rotation: delete old token, issue new pair
    await this.prisma.refreshToken.delete({ where: { id: matched.id } });

    return this.issueTokenPair(matched.userId, matched.user.email);
  }

  async logout(userId: string, dto: RefreshDto) {
    const records = await this.prisma.refreshToken.findMany({
      where: { userId },
    });

    for (const record of records) {
      const ok = await bcrypt.compare(dto.refreshToken, record.tokenHash);
      if (ok) {
        await this.prisma.refreshToken.delete({ where: { id: record.id } });
        return { message: 'Logged out successfully.' };
      }
    }

    throw new UnauthorizedException('TOKEN_INVALID');
  }

  async forgotPassword(dto: ForgotPasswordDto, locale: 'en' | 'ru' = 'en') {
    const user = await this.usersService.findByEmail(dto.email);
    // Always return 200 to prevent email enumeration
    if (!user) return { message: 'If this email is registered, a reset link has been sent.' };

    const token = await this.createEmailToken(user.id, 'RESET_PASSWORD', 30 * 60);
    await this.mailService.sendResetPassword(user.email, token, locale);

    return { message: 'If this email is registered, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.findAndValidateEmailToken(dto.token, 'RESET_PASSWORD');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.emailToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  async resendVerify(dto: ResendVerifyDto, locale: 'en' | 'ru' = 'en') {
    const user = await this.usersService.findByEmail(dto.email);
    // Always return 200 to prevent email enumeration
    if (!user || user.isEmailVerified) {
      return { message: 'If this email requires verification, a new link has been sent.' };
    }

    const token = await this.createEmailToken(user.id, 'VERIFY_EMAIL', 24 * 60 * 60);
    await this.mailService.sendVerifyEmail(user.email, token, locale);

    return { message: 'If this email requires verification, a new link has been sent.' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async issueTokenPair(userId: string, email: string) {
    const accessTtl = this.config.get<number>('JWT_ACCESS_TTL', 900);
    const refreshTtl = this.config.get<number>('JWT_REFRESH_TTL', 2592000);

    const accessToken = this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: accessTtl },
    );

    const rawRefresh = crypto.randomBytes(64).toString('hex');
    const tokenHash = await bcrypt.hash(rawRefresh, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  private async createEmailToken(
    userId: string,
    type: EmailTokenType,
    ttlSeconds: number,
  ): Promise<string> {
    // Invalidate any previous unused tokens of the same type
    await this.prisma.emailToken.deleteMany({
      where: { userId, type, usedAt: null },
    });

    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(raw, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.emailToken.create({
      data: { userId, type, tokenHash, expiresAt },
    });

    return raw;
  }

  private async findAndValidateEmailToken(raw: string, type: EmailTokenType) {
    const candidates = await this.prisma.emailToken.findMany({
      where: { type, usedAt: null, expiresAt: { gt: new Date() } },
    });

    let matched: (typeof candidates)[number] | undefined;
    for (const c of candidates) {
      if (await bcrypt.compare(raw, c.tokenHash)) {
        matched = c;
        break;
      }
    }

    if (!matched) throw new BadRequestException('TOKEN_INVALID');
    return matched;
  }
}
