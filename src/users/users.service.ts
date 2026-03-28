import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { User } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(email: string, password: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return this.prisma.user.create({
      data: { email: email.toLowerCase().trim(), passwordHash },
    });
  }

  async updateProfile(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findById(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findById(id);

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });

    // Invalidate all refresh tokens on password change
    await this.prisma.refreshToken.deleteMany({ where: { userId: id } });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.user.delete({ where: { id } });
  }

  async getProfileWithStats(id: string) {
    const user = await this.findById(id);

    const [totalCompleted, badgesEarned, completedDates] = await Promise.all([
      this.prisma.taskSession.count({
        where: { userId: id, status: 'COMPLETED' },
      }),
      this.prisma.userBadge.count({ where: { userId: id } }),
      this.prisma.taskSession.findMany({
        where: { userId: id, status: 'COMPLETED', completedAt: { not: null } },
        select: { completedAt: true },
        orderBy: { completedAt: 'desc' },
      }),
    ]);

    const currentStreak = this.calculateStreak(
      completedDates.map((s) => s.completedAt as Date),
    );

    return {
      id: user.id,
      email: user.email,
      isEmailVerified: user.isEmailVerified,
      locale: user.locale,
      level: user.level,
      preferredCategories: user.preferredCategories,
      createdAt: user.createdAt.toISOString(),
      stats: { totalCompleted, currentStreak, badgesEarned },
    };
  }

  private calculateStreak(dates: Date[]): number {
    if (dates.length === 0) return 0;

    const uniqueDays = [
      ...new Set(dates.map((d) => d.toISOString().slice(0, 10))),
    ].sort((a, b) => b.localeCompare(a));

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (uniqueDays[0] !== today && uniqueDays[0] !== yesterday) return 0;

    let streak = 1;
    for (let i = 1; i < uniqueDays.length; i++) {
      const prev = new Date(uniqueDays[i - 1]);
      const curr = new Date(uniqueDays[i]);
      const diffDays = Math.round(
        (prev.getTime() - curr.getTime()) / 86400000,
      );
      if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }
}
