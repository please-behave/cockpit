import { afterEach, expect, test, vi } from 'vitest';
import {
  defaultRefreshInterval, refreshIntervalLabel, refreshIntervals, storedRefreshInterval, storeRefreshInterval,
} from './refresh-interval';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

// Verifies REQ-0020.
test('offers 10 seconds, 30 seconds, 1 minute, 2 minutes and 5 minutes, with 5 minutes as the default', () => {
  expect(refreshIntervals.map(refreshIntervalLabel)).toEqual(
    ['10 seconds', '30 seconds', '1 minute', '2 minutes', '5 minutes']);
  expect(defaultRefreshInterval).toBe(300_000);
  expect(storedRefreshInterval()).toBe(300_000);
});

// Verifies REQ-0020.
test('stores the choice under one key and ignores unknown values', () => {
  storeRefreshInterval(30_000);
  expect(localStorage.getItem('cockpit-refresh-interval')).toBe('30000');
  expect(storedRefreshInterval()).toBe(30_000);

  localStorage.setItem('cockpit-refresh-interval', '1000');
  expect(storedRefreshInterval()).toBe(defaultRefreshInterval);
});

// Verifies REQ-0020.
test('applies the default when storage is missing or fails', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  expect(storedRefreshInterval()).toBe(defaultRefreshInterval);
  expect(() => storeRefreshInterval(10_000)).not.toThrow();
});
