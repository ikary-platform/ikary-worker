import { Module } from '@nestjs/common';
import { WorkerModule } from './worker.module.js';

/**
 * Default application module — runs the worker with RabbitMQ adapter and no
 * registered handlers. Production consumers should use WorkerModule.register()
 * directly with their own handler and adapter configuration.
 */
@Module({
  imports: [WorkerModule.register()],
})
export class AppModule {}
