import { z } from 'zod';

export const systemAmqpOptionsSchema = z.object({
  /** AMQP connection URL (e.g. amqp://guest:guest@localhost:5672). */
  url: z.string().min(1),
  /** Main topic exchange name. Routing key = event scope + event name. */
  exchange: z.string().default('cell.events'),
  /** Dead-letter fanout exchange for permanently failed messages. */
  dlx: z.string().default('cell.events.dlx'),
  /** Delay in milliseconds before reconnecting after a connection drop. */
  reconnectDelayMs: z.number().int().positive().default(5000),
});

export type SystemAmqpOptions = z.infer<typeof systemAmqpOptionsSchema>;
