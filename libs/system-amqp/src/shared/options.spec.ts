import { describe, it, expect } from 'vitest';
import { systemAmqpOptionsSchema } from './options.js';

describe('systemAmqpOptionsSchema', () => {
  it('parses a minimal valid config', () => {
    const result = systemAmqpOptionsSchema.parse({ url: 'amqp://localhost' });
    expect(result.url).toBe('amqp://localhost');
    expect(result.exchange).toBe('cell.events');
    expect(result.dlx).toBe('cell.events.dlx');
    expect(result.reconnectDelayMs).toBe(5000);
  });

  it('accepts all fields when provided', () => {
    const result = systemAmqpOptionsSchema.parse({
      url:              'amqp://user:pass@broker:5672',
      exchange:         'my.events',
      dlx:              'my.events.dlx',
      reconnectDelayMs: 2000,
    });
    expect(result.exchange).toBe('my.events');
    expect(result.dlx).toBe('my.events.dlx');
    expect(result.reconnectDelayMs).toBe(2000);
  });

  it('rejects an empty url', () => {
    expect(() => systemAmqpOptionsSchema.parse({ url: '' })).toThrow();
  });

  it('rejects a non-positive reconnectDelayMs', () => {
    expect(() =>
      systemAmqpOptionsSchema.parse({ url: 'amqp://localhost', reconnectDelayMs: 0 }),
    ).toThrow();
  });
});
