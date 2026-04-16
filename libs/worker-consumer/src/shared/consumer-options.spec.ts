import { describe, it, expect } from 'vitest';
import { consumerOptionsSchema } from './consumer-options.schema.js';

describe('consumerOptionsSchema', () => {
  it('applies sensible defaults when nothing is supplied', () => {
    const opts = consumerOptionsSchema.parse({});
    expect(opts).toEqual({
      queuePrefix: 'ikary.',
      exchange:    'cell.events',
      prefetch:    32,
      maxRetries:  5,
      dlx:         'cell.events.dlx',
    });
  });

  it('accepts fully specified overrides', () => {
    const opts = consumerOptionsSchema.parse({
      queuePrefix: 'myapp.',
      exchange:    'my.events',
      prefetch:    128,
      maxRetries:  10,
      dlx:         'my.events.dlx',
    });
    expect(opts.queuePrefix).toBe('myapp.');
    expect(opts.exchange).toBe('my.events');
    expect(opts.prefetch).toBe(128);
    expect(opts.maxRetries).toBe(10);
    expect(opts.dlx).toBe('my.events.dlx');
  });

  it('rejects non-positive prefetch', () => {
    expect(() => consumerOptionsSchema.parse({ prefetch: 0 })).toThrow();
  });

  it('rejects non-positive maxRetries', () => {
    expect(() => consumerOptionsSchema.parse({ maxRetries: -1 })).toThrow();
  });
});
