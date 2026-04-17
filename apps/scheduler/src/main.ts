import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { LogService } from '@ikary/system-log-core/server';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useLogger(app.get(LogService));
  await app.listen(env.PORT);
}

bootstrap();
