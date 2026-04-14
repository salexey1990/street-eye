import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  ALLOWED_ORIGINS: Joi.string().default('http://localhost:3000'),

  DATABASE_URL: Joi.string().required(),

  REDIS_URL: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(2592000),

  RESEND_API_KEY: Joi.string().required(),
  RESEND_FROM: Joi.string().email().required(),

  APP_BASE_URL: Joi.string().uri().required(),

  DEFAULT_LOCALE: Joi.string().valid('en', 'ru').default('en'),
  SUPPORTED_LOCALES: Joi.string().default('en,ru'),

  EXPO_ACCESS_TOKEN: Joi.string().optional(),

  APPLE_SHARED_SECRET: Joi.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_KEY: Joi.string().optional(),
  GOOGLE_PLAY_PACKAGE_NAME: Joi.string().optional(),

  ADMIN_API_KEY: Joi.string().min(32).optional(),

  MONETIZATION_ENABLED: Joi.boolean().default(false),
});
