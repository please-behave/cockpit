import { afterEach, expect, test } from 'vitest';
import { CockpitTime, describeTime } from './pb-time';
import type { Tooltip } from './pb-tooltip';

afterEach(() => document.body.replaceChildren());

// Covers DEC-0022 in the viewer's time zone, including both sides of the DST season.
test.each(['2026-07-22', '2026-11-22'])('shows the local time and exposes the exact instant on %s', async day => {
  const value = `${day}T19:23:07.123456Z`;
  const time = new CockpitTime();
  time.setAttribute('value', value);
  document.body.append(time);
  await time.updateComplete;

  const element = time.shadowRoot!.querySelector('time')!;
  expect(element.dateTime).toBe(value);
  expect(element.hasAttribute('title')).toBe(false);
  expect(element.textContent).toBe(new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value)));
  const exactLocal = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(new Date(value));
  const tooltip = time.shadowRoot!.querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  const root = tooltip.shadowRoot!;
  const id = root.querySelector('button')!.getAttribute('aria-describedby');
  expect(root.querySelector('[role="tooltip"]')).toBe(root.getElementById(id!));
  expect(root.getElementById(id!)!.textContent!.trim()).toBe(`${exactLocal} · ${value} (UTC)`);
});

test('normalizes an offset to UTC while retaining source precision', () => {
  const value = '2026-07-22T21:23:07.123456+02:00';
  expect(describeTime(new Date(value), value)).toContain('2026-07-22T19:23:07.123456Z (UTC)');
});

test('shows an unparseable value as plain text', async () => {
  const time = new CockpitTime();
  time.value = 'timestamp unavailable';
  document.body.append(time);
  await time.updateComplete;

  expect(time.shadowRoot!.querySelector('time')).toBeNull();
  expect(time.shadowRoot!.querySelector('span')?.textContent).toBe('timestamp unavailable');
  expect(time.shadowRoot!.querySelector('pb-tooltip')).toBeNull();

  time.href = '/attestations/invalid';
  await time.updateComplete;
  expect(time.shadowRoot!.querySelector('a')?.textContent).toBe('timestamp unavailable');
  expect(time.shadowRoot!.querySelector('time, pb-tooltip')).toBeNull();
});
