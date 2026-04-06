import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as qs from 'qs';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Parse bracket-notation arrays (e.g. categories[]=VISUAL) as plain arrays
  app.getHttpAdapter().getInstance().set('query parser', (str: string) => qs.parse(str, { allowDots: false }));

  app.use(
    helmet({
      // Allow Swagger UI to load its assets in development
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') ?? [];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'X-Admin-Key'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('StreetEye API')
      .setDescription(
        'Backend API for the StreetEye mobile app — street photography assignments, journal, and badges.\n\n' +
        '**Authentication:** All protected endpoints require `Authorization: Bearer <access_token>`.\n\n' +
        '**Localisation:** Pass `Accept-Language: ru` or `Accept-Language: en` to get localised content (default: `en`).\n\n' +
        '**Response format:** All responses are wrapped: `{ success, data, meta: { timestamp } }`.',
      )
      .setVersion('1.4')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
        'access-token',
      )
      .addTag('auth', 'Registration, login, token management, password reset')
      .addTag('users', 'User profile management')
      .addTag('tasks', 'Photography assignments — random selection, guest preview, browse')
      .addTag('sessions', 'Active session management and history')
      .addTag('notifications', 'Expo push token registration and removal')
      .addTag('subscriptions', 'In-app purchase verification and Free/Premium status')
      .addTag('promo', 'Promo code generation, redemption, and management')
      .addTag('health', 'Service health check')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}
bootstrap();
