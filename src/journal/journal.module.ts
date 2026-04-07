import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';

const redisProvider = {
  provide: 'REDIS_CLIENT',
  inject: [ConfigService],
  useFactory: (config: ConfigService) => new Redis(config.get<string>('REDIS_URL')!),
};

@Module({
  controllers: [JournalController],
  providers: [redisProvider, JournalService],
  exports: [JournalService],
})
export class JournalModule {}
