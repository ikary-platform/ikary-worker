import { Module } from '@nestjs/common';
import { DatabaseService, databaseConnectionOptionsSchema } from '@ikary/system-db-core';
import type { CellRuntimeDatabase } from '@ikary/cell-runtime-core';
import { env } from './config/env.js';

@Module({
  providers: [
    {
      provide: DatabaseService,
      useFactory: (): DatabaseService<CellRuntimeDatabase> =>
        new DatabaseService<CellRuntimeDatabase>(
          databaseConnectionOptionsSchema.parse({ connectionString: env.DATABASE_URL }),
        ),
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
