import { Injectable } from '@nestjs/common';
import type { DomainEventEnvelope } from '@ikary/cell-contract';
import type { IBrokerAdapter } from './broker-adapter.interface.js';

/**
 * No-op broker adapter for tests and local development without a broker.
 *
 * @example
 * WorkerModule.register({
 *   brokerAdapter: { provide: BROKER_ADAPTER, useClass: NullAdapter },
 * })
 */
@Injectable()
export class NullAdapter implements IBrokerAdapter {
  async publish(_event: DomainEventEnvelope): Promise<void> {
    // intentionally empty
  }

  async publishToDlx(_event: DomainEventEnvelope, _reason: string): Promise<void> {
    // intentionally empty
  }
}
