import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  RABBITMQ_EXCHANGE: z.string().default('cell.events'),
  RABBITMQ_DLX: z.string().default('cell.events.dlx'),

  // Retention config — null disables the target's cron
  RETENTION_AUDIT_DAYS:             z.coerce.number().int().positive().nullable().default(2555),
  RETENTION_ANALYTICS_DAYS:         z.coerce.number().int().positive().nullable().default(90),
  RETENTION_ACTIVITY_FEED_DAYS:     z.coerce.number().int().positive().nullable().default(30),
  RETENTION_CONSUMER_RECEIPTS_DAYS: z.coerce.number().int().positive().nullable().default(7),

  PORT: z.coerce.number().int().positive().default(3003),
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
