import { Module, type DynamicModule } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseService } from '@ikary/system-db-core';
import { SystemAmqpModule } from '@ikary/system-amqp/server';
import { systemAmqpOptionsSchema } from '@ikary/system-amqp';
import { SystemLogModule } from '@ikary/system-log-core/server';
import { env } from './config/env.js';
import { DatabaseModule } from './database.module.js';
import { SchedulerJobsRepository } from './scheduler/scheduler-jobs.repository.js';
import { SchedulerPublisher } from './scheduler/scheduler.publisher.js';
import { RetentionScheduler } from './retention/retention.scheduler.js';

@Module({})
export class SchedulerModule {
  static register(): DynamicModule {
    return {
      module: SchedulerModule,
      imports: [
        SystemLogModule.register({
          databaseProviderToken: DatabaseService,
          service:          'ikary-scheduler',
          pretty:           env.LOG_PRETTY,
          seedDefaultSink:  true,
        }),
        ScheduleModule.forRoot(),
        DatabaseModule,
        SystemAmqpModule.register(
          systemAmqpOptionsSchema.parse({
            url:      env.RABBITMQ_URL,
            exchange: env.RABBITMQ_EXCHANGE,
            dlx:      env.RABBITMQ_DLX,
          }),
        ),
      ],
      providers: [
        SchedulerJobsRepository,
        SchedulerPublisher,
        RetentionScheduler,
      ],
    };
  }
}
