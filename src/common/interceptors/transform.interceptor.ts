import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SuccessResponse<T> {
  success: true;
  data: T;
  meta: {
    timestamp: string;
    nextCursor?: string | null;
    hasMore?: boolean;
  };
}

export interface PaginatedData<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

function isPaginatedData<T>(value: unknown): value is PaginatedData<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'nextCursor' in value &&
    'hasMore' in value
  );
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<unknown>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessResponse<unknown>> {
    return next.handle().pipe(
      map((data) => {
        const timestamp = new Date().toISOString();

        if (isPaginatedData<T>(data)) {
          return {
            success: true as const,
            data: data.items,
            meta: {
              timestamp,
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
            },
          };
        }

        return {
          success: true as const,
          data,
          meta: { timestamp },
        };
      }),
    );
  }
}
