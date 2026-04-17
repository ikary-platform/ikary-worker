import { Global, Module } from '@nestjs/common';
import { DatabaseService, databaseConnectionOptionsSchema } from '@ikary/system-db-core';
import type { SchedulerDatabase } from './db/schema.js';
import { env } from './config/env.js';

@Global()
@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: (): DatabaseService<SchedulerDatabase> =>
        new DatabaseService<SchedulerDatabase>(
          databaseConnectionOptionsSchema.parse({ connectionString: env.DATABASE_URL }),
        ),
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
