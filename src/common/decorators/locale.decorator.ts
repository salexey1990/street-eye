import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { LOCALE_KEY } from '../interceptors/locale.interceptor';

export const Locale = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request as any)[LOCALE_KEY] ?? 'en';
  },
);
