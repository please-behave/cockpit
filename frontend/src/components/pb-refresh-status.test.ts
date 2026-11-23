import { afterEach, expect, test, vi } from 'vitest';
import { RefreshStatus, updatedText } from './pb-refresh-status';
import { formatTime } from './pb-time';
import type { Tooltip } from './pb-tooltip';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

const now = new Date('2026-11-22T12:00:00Z');
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

// Verifies REQ-0020.
test.each([
  [0, 'Updated a few seconds ago'],
  [59, 'Updated a few seconds ago'],
  [60, 'Updated 1 minute ago'],
  [119, 'Updated 1 minute ago'],
  [120, 'Updated 2 minutes ago'],
  [3600, 'Updated 1 hour ago'],
])('describes %i seconds as "%s"', (seconds, expected) => {
  expect(updatedText(ago(seconds), now)).toBe(expected);
});

async function mount(updatedAt: Date, busy = false) {
  const status = new RefreshStatus();
  status.updatedAt = updatedAt;
  status.busy = busy;
  document.body.append(status);
  await status.updateComplete;
  return status;
}

// Verifies REQ-0020.
test('shows the age with the exact time, a named button, and no live region', async () => {
  const status = await mount(new Date());
  const root = status.shadowRoot!;
  expect(root.querySelector('time')?.textContent).toBe('Updated a few seconds ago');
  expect(root.querySelector<Tooltip>('pb-tooltip')!.description).toBe(formatTime(status.updatedAt));
  expect(root.querySelector('button')?.getAttribute('aria-label')).toBe('Refresh');
  expect(root.querySelector('[aria-live], [role=status], [role=alert]')).toBeNull();
});

// Verifies REQ-0020.
test('updates the text every 10 seconds without a request and stops when removed', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const status = await mount(new Date());
  const text = () => status.shadowRoot!.querySelector('time')!.textContent;
  expect(text()).toBe('Updated a few seconds ago');

  await vi.advanceTimersByTimeAsync(60_000);
  await status.updateComplete;
  expect(text()).toBe('Updated 1 minute ago');

  status.remove();
  expect(vi.getTimerCount()).toBe(0);
});

// Verifies REQ-0020.
test('requests a refresh and ignores clicks while busy', async () => {
  const status = await mount(new Date());
  const refresh = vi.fn();
  status.addEventListener('refresh', refresh);
  const button = status.shadowRoot!.querySelector('button')!;
  button.click();
  expect(refresh).toHaveBeenCalledTimes(1);

  status.busy = true;
  await status.updateComplete;
  expect(button.getAttribute('aria-disabled')).toBe('true');
  expect(button.classList.contains('busy')).toBe(true);
  button.click();
  expect(refresh).toHaveBeenCalledTimes(1);
});
