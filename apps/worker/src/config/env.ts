import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  /**
   * Maximum dispatch attempts before a row is permanently failed.
   * Informational — the hard limit is enforced inside OutboxRepository.markFailed
   * (which sets failed_at once retry_count reaches its own cap). This value is
   * exposed here so downstream consumers can read it without hard-coding 5.
   */
  OUTBOX_MAX_RETRIES: z.coerce.number().int().positive().default(5),
  RABBITMQ_EXCHANGE: z.string().default('cell.events'),
  RABBITMQ_DLX: z.string().default('cell.events.dlx'),
  PORT: z.coerce.number().int().positive().default(3002),
  /**
   * Enable pretty-printed logs (true for local dev, false for production JSON).
   * Parsed explicitly because `z.coerce.boolean()` uses JS truthiness —
   * `Boolean("false") === true`, so `LOG_PRETTY=false` would enable pretty logs.
   */
  LOG_PRETTY: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
