import { Injectable } from '@nestjs/common';
import { AmqpConnectionService } from '@ikary/system-amqp/server';

export interface ConsumerHealthResult {
  status: 'up' | 'down';
  message?: string;
}

/**
 * Lightweight health check for the consumer framework.
 *
 * Up iff the AmqpConnectionService has an active channel. During a reconnect
 * window getChannel() throws and the check reports 'down', giving Kubernetes
 * readiness probes accurate data to stop routing traffic to a pod that
 * cannot consume.
 *
 * Not tied to @nestjs/terminus — callers can wrap this indicator in a
 * HealthIndicator if they want, but we avoid the hard dependency.
 */
@Injectable()
export class ConsumerHealthIndicator {
  constructor(private readonly amqp: AmqpConnectionService) {}

  check(): ConsumerHealthResult {
    try {
      this.amqp.getChannel();
      return { status: 'up' };
    } catch (err) {
      return { status: 'down', message: (err as Error).message };
    }
  }
}
