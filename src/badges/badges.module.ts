import { Module } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';
import { JournalModule } from '../journal/journal.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [JournalModule, NotificationsModule],
  controllers: [BadgesController],
  providers: [BadgesService],
  exports: [BadgesService],
})
export class BadgesModule {}
