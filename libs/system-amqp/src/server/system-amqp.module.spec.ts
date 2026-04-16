import { describe, it, expect } from 'vitest';
import { SystemAmqpModule } from './system-amqp.module.js';
import { AmqpConnectionService } from './amqp-connection.service.js';
import { AmqpPublisherService } from './amqp-publisher.service.js';
import { SYSTEM_AMQP_OPTIONS } from './tokens.js';
import type { SystemAmqpOptions } from '../shared/options.js';

const TEST_OPTIONS: SystemAmqpOptions = {
  url:              'amqp://localhost',
  exchange:         'test.events',
  dlx:              'test.events.dlx',
  reconnectDelayMs: 5000,
};

describe('SystemAmqpModule.register', () => {
  it('returns a DynamicModule scoped to SystemAmqpModule', () => {
    const mod = SystemAmqpModule.register(TEST_OPTIONS);
    expect(mod.module).toBe(SystemAmqpModule);
  });

  it('provides SYSTEM_AMQP_OPTIONS with the supplied value', () => {
    const mod = SystemAmqpModule.register(TEST_OPTIONS);
    const optionsProvider = (mod.providers ?? []).find(
      (p) => typeof p === 'object' && 'provide' in p && p.provide === SYSTEM_AMQP_OPTIONS,
    );
    expect(optionsProvider).toBeDefined();
    expect((optionsProvider as { useValue: unknown }).useValue).toBe(TEST_OPTIONS);
  });

  it('provides AmqpConnectionService', () => {
    const mod = SystemAmqpModule.register(TEST_OPTIONS);
    expect(mod.providers).toContain(AmqpConnectionService);
  });

  it('provides AmqpPublisherService', () => {
    const mod = SystemAmqpModule.register(TEST_OPTIONS);
    expect(mod.providers).toContain(AmqpPublisherService);
  });

  it('exports AmqpConnectionService and AmqpPublisherService', () => {
    const mod = SystemAmqpModule.register(TEST_OPTIONS);
    expect(mod.exports).toContain(AmqpConnectionService);
    expect(mod.exports).toContain(AmqpPublisherService);
  });
});
