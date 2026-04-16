import { describe, it, expect } from 'vitest';
import { RETRY_COUNT_HEADER, getRetryCount, incrementRetry } from './retry-metadata.js';

describe('retry-metadata', () => {
  describe('getRetryCount', () => {
    it('returns 0 when headers are undefined', () => {
      expect(getRetryCount(undefined)).toBe(0);
    });

    it('returns 0 when the retry header is missing', () => {
      expect(getRetryCount({ other: 'value' })).toBe(0);
    });

    it('returns the integer value when the header is a valid non-negative number', () => {
      expect(getRetryCount({ [RETRY_COUNT_HEADER]: 3 })).toBe(3);
    });

    it('floors fractional values', () => {
      expect(getRetryCount({ [RETRY_COUNT_HEADER]: 2.9 })).toBe(2);
    });

    it('returns 0 for a negative header value', () => {
      expect(getRetryCount({ [RETRY_COUNT_HEADER]: -1 })).toBe(0);
    });

    it('returns 0 for a non-finite header value', () => {
      expect(getRetryCount({ [RETRY_COUNT_HEADER]: Number.POSITIVE_INFINITY })).toBe(0);
      expect(getRetryCount({ [RETRY_COUNT_HEADER]: Number.NaN })).toBe(0);
    });

    it('returns 0 for a non-numeric header value', () => {
      expect(getRetryCount({ [RETRY_COUNT_HEADER]: '3' })).toBe(0);
      expect(getRetryCount({ [RETRY_COUNT_HEADER]: true })).toBe(0);
    });
  });

  describe('incrementRetry', () => {
    it('starts at 1 when headers are empty', () => {
      expect(incrementRetry(undefined)).toEqual({ [RETRY_COUNT_HEADER]: 1 });
    });

    it('preserves other headers while incrementing the retry count', () => {
      expect(
        incrementRetry({ 'x-other': 'v', [RETRY_COUNT_HEADER]: 4 }),
      ).toEqual({ 'x-other': 'v', [RETRY_COUNT_HEADER]: 5 });
    });

    it('treats a missing retry header as zero and sets it to 1', () => {
      expect(incrementRetry({ 'x-other': 'v' })).toEqual({ 'x-other': 'v', [RETRY_COUNT_HEADER]: 1 });
    });
  });
});
