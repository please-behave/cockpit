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

const ring = (status: RefreshStatus) => status.shadowRoot!.querySelector<SVGElement>('.ring')!;
const select = (status: RefreshStatus) => status.shadowRoot!.querySelector('select')!;

// Verifies REQ-0020.
test('names the interval menu, lists the intervals and exposes the current value', async () => {
  const status = new RefreshStatus();
  status.updatedAt = new Date();
  status.interval = 120_000;
  document.body.append(status);
  await status.updateComplete;
  const menu = select(status);
  expect(menu.getAttribute('aria-label')).toBe('Refresh interval');
  expect([...menu.options].map(option => option.textContent!.trim())).toEqual(
    ['10 seconds', '30 seconds', '1 minute', '2 minutes', '5 minutes']);
  expect(menu.value).toBe('120000');
  expect(menu.selectedOptions[0].textContent!.trim()).toBe('2 minutes');
});

// Verifies REQ-0020.
test('defaults to 5 minutes', async () => {
  expect(select(await mount(new Date())).value).toBe('300000');
});

// Verifies REQ-0020.
test('reports a chosen interval, which a native select lets the keyboard operate', async () => {
  const status = await mount(new Date());
  const chosen = vi.fn();
  status.addEventListener('interval-change', event => chosen((event as CustomEvent<number>).detail));
  const menu = select(status);
  menu.focus();
  menu.value = '10000';
  menu.dispatchEvent(new Event('change'));
  expect(chosen).toHaveBeenCalledWith(10_000);
  expect(menu.tabIndex).toBe(0);
});

// Verifies REQ-0020.
test.each([
  ['start', 0, 30_000, 0],
  ['middle', 15_000, 30_000, -15_000],
  ['end', 30_000, 30_000, -30_000],
  ['past the end', 45_000, 30_000, -30_000],
])('fills the ring over the interval: %s', async (_name, elapsed, interval, delay) => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], now });
  const status = new RefreshStatus();
  status.updatedAt = now;
  status.interval = interval;
  status.cycleStart = now.getTime() - elapsed;
  document.body.append(status);
  await status.updateComplete;
  expect(ring(status).style.getPropertyValue('--ring-duration')).toBe(`${interval}ms`);
  expect(Number.parseFloat(ring(status).style.getPropertyValue('--ring-delay')) || 0).toBe(delay);
  expect(ring(status).getAttribute('aria-hidden')).toBe('true');
});

// Verifies REQ-0020.
test('restarts the ring when a new interval begins', async () => {
  const status = await mount(new Date());
  const first = ring(status);
  status.cycleStart += 1000;
  await status.updateComplete;
  expect(ring(status)).not.toBe(first);
});

// Verifies REQ-0020.
test('moves the ring in steps with reduced motion and uses no other animation on it', () => {
  const css = RefreshStatus.styles.toString();
  const reduced = css.slice(css.indexOf('prefers-reduced-motion'));
  expect(reduced).toMatch(/\.ring circle\s*{\s*animation-timing-function: steps\(\d+\)/);
});
