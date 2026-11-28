import { afterEach, expect, test } from 'vitest';
import { StatusPill } from './pb-status-pill';

afterEach(() => document.body.replaceChildren());

const statuses = [
  ['PASS', 'passed', 'check', 'Pass'],
  ['FAIL', 'failed', 'cross', 'Fail'],
  ['ERROR', 'error', 'error', 'Error'],
  ['WARN', 'warning', 'warning', 'Warn'],
  ['NOT_RUN', 'not-run', 'circle', 'Not run'],
  ['release not recorded', 'not-run', 'circle', 'Release not recorded'],
  ['No evidence', 'not-run', 'dash'],
  ['Verified', 'passed', 'check'],
  ['Unverified', 'warning', 'warning'],
  ['Complete', 'passed', 'check'],
  ['Incomplete', 'warning', 'warning'],
  ['Repository not compliant', 'warning', 'warning'],
  ['API key', 'warning', 'warning'],
  ['constructor', 'unknown', 'question'],
];

// Verifies REQ-0016.
test.each(statuses)('renders %s with the shared label with its own visual cue', async (status, style, icon, label) => {
  const pill = document.createElement('pb-status-pill') as StatusPill;
  pill.setAttribute('status', status);
  document.body.append(pill);
  await pill.updateComplete;

  const rendered = pill.shadowRoot!.querySelector(`.pill.${style}`)!;
  const cue = rendered.querySelector('pb-icon')!;
  const svg = cue.shadowRoot!.querySelector('svg')!;
  expect(cue.getAttribute('name')).toBe(icon);
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(rendered.lastElementChild?.textContent).toBe(label ?? status);
});

test('offers one unframed presentation as the reported status changes', async () => {
  const pill = new StatusPill();
  document.body.append(pill);
  await pill.updateComplete;
  expect(pill.shadowRoot!.querySelector('.pill.unknown')).not.toBeNull();
  expect(StatusPill.observedAttributes).toEqual(['status']);
  expect(StatusPill.styles.cssText).not.toMatch(/\b(?:border(?:-[\w-]+)?|background(?:-[\w-]+)?|box-shadow|padding(?:-[\w-]+)?)\s*:/);

  pill.status = 'PASS';
  await pill.updateComplete;
  expect(pill.shadowRoot!.querySelector('.pill.passed')?.lastElementChild?.textContent).toBe('Pass');
});

// Verifies REQ-0016.
test('uses a pointer cursor and prevents label text selection', () => {
  const styles = StatusPill.styles.cssText;
  expect(styles).toMatch(/\.pill \{[^}]*cursor: pointer;[^}]*user-select: none;/);
});

// Verifies REQ-0016.
test('keeps the outcome and icon together beside a long identity', () => {
  const styles = StatusPill.styles.cssText;
  expect(styles).toMatch(/:host\s*{\s*flex-shrink: 0;/);
  expect(styles).toMatch(/\.pill\s*{[^}]*white-space: nowrap;/);
});
