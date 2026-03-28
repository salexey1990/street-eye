/**
 * Reusable Swagger response decorators for standard error shapes.
 * Import and apply with `@ApiErrorResponses()` on controllers
 * that need a common set of error response docs.
 */
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

const errorSchema = (code: string, message: string) => ({
  schema: {
    example: {
      success: false,
      error: { code, message, details: [] },
      meta: { timestamp: '2026-03-01T10:00:00Z' },
    },
  },
});

export const ApiValidationErrorResponse = () =>
  ApiResponse({
    status: 400,
    description: 'Validation error — one or more fields are invalid.',
    ...errorSchema('VALIDATION_ERROR', 'Validation failed'),
  });

export const ApiUnauthorizedResponse = () =>
  ApiResponse({
    status: 401,
    description: 'Missing or invalid access token.',
    ...errorSchema('TOKEN_INVALID', 'Invalid or expired token'),
  });

export const ApiNotFoundResponse = () =>
  ApiResponse({
    status: 404,
    description: 'Resource not found.',
    ...errorSchema('NOT_FOUND', 'The requested resource was not found'),
  });

export const ApiRateLimitResponse = () =>
  ApiResponse({
    status: 429,
    description: 'Too many requests.',
    ...errorSchema('RATE_LIMIT_EXCEEDED', 'Too many requests, please try again later'),
  });

/** Applies 400 + 401 + 429 in one go — useful for most protected endpoints. */
export const ApiCommonResponses = () =>
  applyDecorators(
    ApiValidationErrorResponse(),
    ApiUnauthorizedResponse(),
    ApiRateLimitResponse(),
  );
