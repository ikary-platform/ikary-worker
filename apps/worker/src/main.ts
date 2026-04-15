import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { LogService } from '@ikary/system-log-core/server';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Route all NestJS Logger calls through @ikary/system-log-core's LogService
  // (structured Pino, DB-backed sinks). SystemLogModule is @Global() so
  // app.get(LogService) is available immediately after app creation.
  app.useLogger(app.get(LogService));

  await app.listen(env.PORT);
}

bootstrap();
