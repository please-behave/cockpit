import { afterEach, expect, test, vi } from 'vitest';
import { relativeTime, RelativeTime } from './pb-relative-time';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

const now = new Date('2026-11-22T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

// Verifies REQ-0019.
test.each([
  [0, 'just now'],
  [59, 'just now'],
  [-30, 'just now'],
  [60, '1 minute ago'],
  [300, '5 minutes ago'],
  [3599, '59 minutes ago'],
  [3600, '1 hour ago'],
  [3 * 3600, '3 hours ago'],
  [86_400, '1 day ago'],
  [2 * 86_400, '2 days ago'],
])('describes %i seconds as %s', (seconds, expected) => {
  expect(relativeTime(ago(seconds), now)).toBe(expected);
});

test('keeps the text current without new data and stops when removed', async () => {
  vi.useFakeTimers({ now: new Date('2026-11-22T12:00:30Z') });
  const element = new RelativeTime();
  element.value = '2026-11-22T12:00:00Z';
  document.body.append(element);
  await element.updateComplete;
  const read = () => element.shadowRoot!.querySelector('time')!;
  expect(read().textContent).toBe('just now');
  expect(read().dateTime).toBe('2026-11-22T12:00:00Z');
  expect(read().title).not.toBe('');

  await vi.advanceTimersByTimeAsync(60_000);
  expect(read().textContent).toBe('1 minute ago');

  element.remove();
  expect(vi.getTimerCount()).toBe(0);
});

test('shows an unparseable value as plain text', async () => {
  const element = new RelativeTime();
  element.value = 'later';
  document.body.append(element);
  await element.updateComplete;
  expect(element.shadowRoot!.querySelector('time')).toBeNull();
  expect(element.shadowRoot!.textContent).toBe('later');
});
