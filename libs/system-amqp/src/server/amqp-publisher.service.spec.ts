import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmqpPublisherService } from './amqp-publisher.service.js';
import type { AmqpConnectionService } from './amqp-connection.service.js';
import type { SystemAmqpOptions } from '../shared/options.js';

const TEST_OPTIONS: SystemAmqpOptions = {
  url:              'amqp://localhost',
  exchange:         'test.events',
  dlx:              'test.events.dlx',
  reconnectDelayMs: 5000,
};

describe('AmqpPublisherService', () => {
  let service: AmqpPublisherService;
  let mockChannel: { publish: ReturnType<typeof vi.fn> };
  let mockConnection: Pick<AmqpConnectionService, 'getChannel'>;

  beforeEach(() => {
    mockChannel = { publish: vi.fn().mockReturnValue(true) };
    mockConnection = { getChannel: vi.fn().mockReturnValue(mockChannel) };
    service = new AmqpPublisherService(
      mockConnection as AmqpConnectionService,
      TEST_OPTIONS,
    );
  });

  describe('publishToExchange', () => {
    it('calls channel.publish with the configured exchange', () => {
      const body = Buffer.from('{}');
      service.publishToExchange('my.routing.key', body);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        TEST_OPTIONS.exchange,
        'my.routing.key',
        body,
        undefined,
      );
    });

    it('passes msgOptions through to channel.publish', () => {
      const body    = Buffer.from('{}');
      const options = { persistent: true, contentType: 'application/json' };
      service.publishToExchange('rk', body, options);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        TEST_OPTIONS.exchange, 'rk', body, options,
      );
    });
  });

  describe('publishToDlx', () => {
    it('calls channel.publish with the DLX exchange and empty routing key', () => {
      const body = Buffer.from('{"failure":"test"}');
      service.publishToDlx(body);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        TEST_OPTIONS.dlx,
        '',
        body,
        undefined,
      );
    });

    it('passes msgOptions through to channel.publish', () => {
      const body    = Buffer.from('{}');
      const options = { persistent: true };
      service.publishToDlx(body, options);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        TEST_OPTIONS.dlx, '', body, options,
      );
    });
  });
});
