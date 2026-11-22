import { afterEach, expect, test } from 'vitest';
import { CockpitTime } from './pb-time';

afterEach(() => document.body.replaceChildren());

// Covers the format in DEC-0007.
test('formats the instant in the viewer locale and time zone and retains the original value', async () => {
  const value = '2026-11-22T19:23:07.123456Z';
  const time = new CockpitTime();
  time.setAttribute('value', value);
  document.body.append(time);
  await time.updateComplete;

  const element = time.shadowRoot!.querySelector('time')!;
  expect(element.dateTime).toBe(value);
  expect(element.title).toBe(value);
  expect(element.textContent).toBe(new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(new Date(value)));
});

test('shows an unparseable value as plain text', async () => {
  const time = new CockpitTime();
  time.value = 'timestamp unavailable';
  document.body.append(time);
  await time.updateComplete;

  expect(time.shadowRoot!.querySelector('time')).toBeNull();
  expect(time.shadowRoot!.querySelector('span')?.textContent).toBe('timestamp unavailable');
});
