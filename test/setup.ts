// Set required env vars before any module is loaded
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // random port
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-chars-long-enough';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-chars-long-enough';
process.env.JWT_ACCESS_TTL = '900';
process.env.JWT_REFRESH_TTL = '2592000';
process.env.RESEND_API_KEY = 're_test_key';
process.env.RESEND_FROM = 'noreply@test.com';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.DEFAULT_LOCALE = 'en';
process.env.SUPPORTED_LOCALES = 'en,ru';
