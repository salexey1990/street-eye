import { Module, forwardRef } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { BadgesModule } from '../badges/badges.module';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';

@Module({
  imports: [TasksModule, forwardRef(() => BadgesModule)],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
