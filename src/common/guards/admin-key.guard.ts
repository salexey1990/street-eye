import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-admin-key'] as string | undefined;
    const expected = this.config.get<string>('ADMIN_API_KEY');

    if (!apiKey || apiKey !== expected) {
      throw new UnauthorizedException('Invalid or missing admin API key');
    }

    return true;
  }
}
