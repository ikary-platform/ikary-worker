import { describe, it, expect, vi } from 'vitest';
import type { AmqpConnectionService } from '@ikary/system-amqp/server';
import { ConsumerHealthIndicator } from './consumer.health-indicator.js';

describe('ConsumerHealthIndicator.check', () => {
  it('returns up when AmqpConnectionService has an active channel', () => {
    const amqp = { getChannel: vi.fn().mockReturnValue({}) } as unknown as AmqpConnectionService;
    const indicator = new ConsumerHealthIndicator(amqp);
    expect(indicator.check()).toEqual({ status: 'up' });
  });

  it('returns down with the error message when getChannel throws', () => {
    const amqp = {
      getChannel: vi.fn().mockImplementation(() => {
        throw new Error('AMQP channel is not available');
      }),
    } as unknown as AmqpConnectionService;
    const indicator = new ConsumerHealthIndicator(amqp);
    expect(indicator.check()).toEqual({
      status: 'down',
      message: 'AMQP channel is not available',
    });
  });
});
