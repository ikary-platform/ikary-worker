import { Module } from '@nestjs/common';
import { SchedulerModule } from './scheduler.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    SchedulerModule.register(),
    HealthModule,
  ],
})
export class AppModule {}
