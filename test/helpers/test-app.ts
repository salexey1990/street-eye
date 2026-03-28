import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import helmet from 'helmet';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MailService } from '../../src/mail/mail.service';
import { InMemoryPrismaService } from './prisma.mock';

export interface TestContext {
  app: INestApplication;
  prisma: InMemoryPrismaService;
  mailService: { sendVerifyEmail: jest.Mock; sendResetPassword: jest.Mock };
}

// Always reports 1 hit → throttle limits never trigger in tests
const noopThrottlerStorage = {
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 0,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

export async function createTestApp(): Promise<TestContext> {
  const prisma = new InMemoryPrismaService();

  const mailService = {
    sendVerifyEmail: jest.fn().mockResolvedValue(undefined),
    sendResetPassword: jest.fn().mockResolvedValue(undefined),
  };

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(MailService)
    .useValue(mailService)
    .overrideProvider(ThrottlerStorage)
    .useValue(noopThrottlerStorage)
    .compile();

  const app = moduleRef.createNestApplication();

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  return { app, prisma, mailService };
}
