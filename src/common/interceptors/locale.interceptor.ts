import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { Request } from 'express';

export const LOCALE_KEY = 'locale';

@Injectable()
export class LocaleInterceptor implements NestInterceptor {
  private readonly supportedLocales: string[];
  private readonly defaultLocale: string;

  constructor(private readonly config: ConfigService) {
    this.defaultLocale = this.config.get<string>('DEFAULT_LOCALE', 'en');
    this.supportedLocales = this.config
      .get<string>('SUPPORTED_LOCALES', 'en,ru')
      .split(',')
      .map((l) => l.trim().toLowerCase());
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    const acceptLang = request.headers['accept-language'];
    const headerLocale = acceptLang
      ? this.parseAcceptLanguage(acceptLang)
      : null;

    const userLocale = (request.user as { locale?: string })?.locale;

    const resolved =
      headerLocale ??
      (userLocale ? userLocale.toLowerCase() : null) ??
      this.defaultLocale;

    (request as any)[LOCALE_KEY] = resolved;

    return next.handle();
  }

  private parseAcceptLanguage(header: string): string | null {
    const primary = header.split(',')[0].split(';')[0].trim().toLowerCase();
    const lang = primary.split('-')[0];
    return this.supportedLocales.includes(lang) ? lang : null;
  }
}
