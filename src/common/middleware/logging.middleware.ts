import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const isProd = process.env.NODE_ENV === 'production';

/** Fields that must never appear in logs even in debug mode. */
const REDACTED = new Set(['password', 'newPassword', 'currentPassword', 'receipt', 'tokenHash']);

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 4 || obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v) => redact(v, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = REDACTED.has(key) ? '[REDACTED]' : redact(value, depth + 1);
  }
  return result;
}

function compact(obj: unknown): string {
  return JSON.stringify(obj);
}

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl } = req;
    const start = Date.now();

    // Capture response body by monkey-patching res.json
    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      const ms = Date.now() - start;
      const { statusCode } = res;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';

      if (isProd) {
        this.logger[level](`${method} ${originalUrl} ${statusCode} ${ms}ms`);
        return;
      }

      const parts: string[] = [`${method} ${originalUrl} ${statusCode} ${ms}ms`];

      const params = req.params && Object.keys(req.params).length ? req.params : null;
      const query = req.query && Object.keys(req.query).length ? req.query : null;
      const body = req.body && Object.keys(req.body).length ? redact(req.body) : null;

      if (params) parts.push(`  params : ${compact(params)}`);
      if (query)  parts.push(`  query  : ${compact(query)}`);
      if (body)   parts.push(`  body   : ${compact(body)}`);
      if (responseBody !== undefined) parts.push(`  res    : ${compact(redact(responseBody))}`);

      this.logger[level](parts.join('\n'));
    });

    next();
  }
}
