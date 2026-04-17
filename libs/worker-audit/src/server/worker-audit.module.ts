import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { workerAuditConfigSchema, type WorkerAuditConfig } from '../config/worker-audit.config.js';
import { AuditRepository } from './repositories/audit.repository.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { AuditConsumer } from '../modules/audit/audit.consumer.js';
import { WORKER_AUDIT_CONFIG, WORKER_AUDIT_DATABASE } from './worker-audit.tokens.js';

/**
 * Register the worker-audit lib. The consuming app additionally registers the
 * AuditConsumer in its ConsumerModule.register({ consumers }) — we keep the
 * consumer wiring explicit at the app level to avoid multi-provider DI traps
 * across dynamic module boundaries.
 *
 * Registered as a global module so the sibling `ConsumerModule` (which
 * instantiates `AuditConsumer` via its `CONSUMER` multi-provider token) can
 * inject `AuditService` without the app having to re-import this module into
 * every module that needs it. Matches the `@Global()` pattern used by
 * `DatabaseModule`, `SystemLogModule`, and `SystemAmqpModule`.
 */
@Module({})
export class WorkerAuditModule {
  static register(input: WorkerAuditConfig): DynamicModule {
    const config = workerAuditConfigSchema.parse(input);

    const providers: Provider[] = [
      { provide: WORKER_AUDIT_CONFIG, useValue: config },
      {
        provide: WORKER_AUDIT_DATABASE,
        useFactory: (db: unknown) => db,
        inject: [config.databaseProviderToken],
      },
      AuditRepository,
      AuditService,
      AuditConsumer,
    ];

    return {
      module: WorkerAuditModule,
      global: true,
      providers,
      exports: [
        AuditRepository,
        AuditService,
        AuditConsumer,
        WORKER_AUDIT_CONFIG,
        WORKER_AUDIT_DATABASE,
      ],
    };
  }
}
