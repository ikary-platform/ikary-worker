import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT);
  console.log(`ikary-worker running on port ${env.PORT}`);
}

bootstrap();
