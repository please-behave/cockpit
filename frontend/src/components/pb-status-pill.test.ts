import { afterEach, describe, expect, test } from 'vitest';
import { StatusPill } from './pb-status-pill';

afterEach(() => document.body.replaceChildren());

const statuses = [
  ['PASS', 'passed', 'check'],
  ['FAIL', 'failed', 'cross'],
  ['ERROR', 'error', 'error'],
  ['WARN', 'warning', 'warning'],
  ['NOT_RUN', 'not-run', 'dash'],
  ['release not recorded', 'not-run', 'circle'],
  ['No evidence', 'not-run', 'dash'],
  ['Verified', 'passed', 'check'],
  ['Unverified', 'warning', 'warning'],
  ['Complete', 'passed', 'check'],
  ['Incomplete', 'warning', 'warning'],
  ['API key', 'warning', 'warning'],
  ['constructor', 'unknown', 'question'],
];

// Verifies REQ-0016.
describe.each(['boxed', 'compact'])('%s variant', variant => {
  test.each(statuses)('renders %s as reported text with its own visual cue', async (status, style, icon) => {
    const pill = document.createElement('pb-status-pill') as StatusPill;
    pill.setAttribute('status', status);
    pill.setAttribute('variant', variant);
    document.body.append(pill);
    await pill.updateComplete;

    const rendered = pill.shadowRoot!.querySelector(`.pill.${style}`)!;
    const cue = rendered.querySelector('pb-icon')!;
    const svg = cue.shadowRoot!.querySelector('svg')!;
    expect(rendered.classList.contains('compact')).toBe(variant === 'compact');
    expect(cue.getAttribute('name')).toBe(icon);
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(rendered.lastElementChild?.textContent).toBe(status);
  });
});

test('defaults to boxed and updates when the status and variant change', async () => {
  const pill = new StatusPill();
  document.body.append(pill);
  await pill.updateComplete;
  expect(pill.shadowRoot!.querySelector('.pill.unknown:not(.compact)')).not.toBeNull();

  pill.status = 'PASS';
  pill.variant = 'compact';
  await pill.updateComplete;
  expect(pill.shadowRoot!.querySelector('.compact.passed')?.lastElementChild?.textContent).toBe('PASS');
});
