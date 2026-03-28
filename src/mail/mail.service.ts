import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as fs from 'fs';
import * as path from 'path';

type Locale = 'en' | 'ru';

@Injectable()
export class MailService {
  private readonly resend: Resend;
  private readonly from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(config.get<string>('RESEND_API_KEY'));
    this.from = config.get<string>('RESEND_FROM', 'noreply@streeteye.app');
  }

  async sendVerifyEmail(to: string, token: string, locale: Locale = 'en') {
    const baseUrl = this.config.get<string>('APP_BASE_URL');
    const verifyUrl = `${baseUrl}/auth/verify-email?token=${token}`;
    const html = this.renderTemplate('verify-email', locale, { verifyUrl });

    await this.send(to, locale === 'ru' ? 'Подтвердите email — StreetEye' : 'Verify your email — StreetEye', html);
  }

  async sendResetPassword(to: string, token: string, locale: Locale = 'en') {
    const baseUrl = this.config.get<string>('APP_BASE_URL');
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
    const html = this.renderTemplate('reset-password', locale, { resetUrl });

    await this.send(to, locale === 'ru' ? 'Сброс пароля — StreetEye' : 'Reset your password — StreetEye', html);
  }

  private renderTemplate(
    name: string,
    locale: Locale,
    vars: Record<string, string>,
  ): string {
    const templatePath = path.join(__dirname, 'templates', `${name}.${locale}.html`);
    let html = fs.readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(vars)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }
    return html;
  }

  private async send(to: string, subject: string, html: string) {
    try {
      await this.resend.emails.send({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${String(err)}`);
      throw err;
    }
  }
}
