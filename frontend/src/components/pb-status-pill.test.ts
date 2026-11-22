import { afterEach, expect, test } from 'vitest';
import { StatusPill } from './pb-status-pill';

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0016.
test.each([
  ['PASS', 'passed', '✓'],
  ['FAIL', 'failed', '×'],
  ['ERROR', 'error', '!'],
  ['WARN', 'warning', '▲'],
  ['NOT_RUN', 'not-run', '–'],
  ['constructor', 'unknown', '?'],
])('renders %s as reported text with its own visual cue', async (status, style, symbol) => {
  const pill = document.createElement('pb-status-pill') as StatusPill;
  pill.setAttribute('status', status);
  document.body.append(pill);
  await pill.updateComplete;

  const rendered = pill.shadowRoot!.querySelector(`.${style}`)!;
  expect(rendered.firstElementChild?.textContent).toBe(symbol);
  expect(rendered.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  expect(rendered.lastElementChild?.textContent).toBe(status);
});

test('updates when a reported value arrives', async () => {
  const pill = new StatusPill();
  document.body.append(pill);
  await pill.updateComplete;
  expect(pill.shadowRoot!.querySelector('.unknown')).not.toBeNull();

  pill.status = 'PASS';
  await pill.updateComplete;
  expect(pill.shadowRoot!.querySelector('.passed')?.lastElementChild?.textContent).toBe('PASS');
});
