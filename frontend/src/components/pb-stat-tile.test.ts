import { afterEach, expect, test } from 'vitest';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import type { RepositoryOverview } from '../api/client';
import type { RepositoryHealth } from '../repository-health';
import { StatTile } from './pb-stat-tile';
import type { Tooltip } from './pb-tooltip';

const overview = respond(fixtureTargets.repositoryOverview)!.body as RepositoryOverview;

async function mount(status: RepositoryHealth, active = false, repositories = overview.repositories) {
  const tile = new StatTile();
  tile.status = status;
  tile.repositories = repositories;
  tile.active = active;
  document.body.append(tile);
  await tile.updateComplete;
  return tile.shadowRoot!;
}

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0015 and REQ-0019.
test.each([
  ['failed', 'cross', '4', 'Fail', '4 Fail'],
  ['warning', 'warning', '1', 'Warn', '1 Warn'],
  ['not-run', 'circle', '3', 'Not run', '3 Not run'],
  ['passed', 'check', '3', 'Pass', '3 Pass'],
] as const)('shows the %s group and links to its filter', async (status, symbol, count, label, name) => {
  const root = await mount(status);
  const link = root.querySelector('a')!;
  expect(link.getAttribute('href')).toBe(`/?status=${status}`);
  expect(link.getAttribute('aria-label')).toBe(name);
  expect(link.hasAttribute('aria-current')).toBe(false);
  expect(link.querySelector('pb-icon')?.getAttribute('name')).toBe(symbol);
  expect(link.querySelector('.count')?.textContent).toBe(count);
  expect(link.querySelector('.outcome-label')?.textContent).toBe(`${count} ${label}`);
  const outcome = link.querySelector('.outcome')!;
  expect(outcome.classList.contains('muted')).toBe(status === 'passed');
  expect(outcome.classList.contains(status)).toBe(status !== 'passed');
});

test('leaves count links unframed and uses muted text for subdued outcomes', () => {
  const styles = StatTile.styles.at(-1)!.cssText;
  expect(styles).not.toMatch(/\b(?:border(?:-[\w-]+)?|background(?:-[\w-]+)?|box-shadow)\s*:/);
  expect(styles).toMatch(/\.muted\s*\{\s*color:\s*var\(--text-muted\)/);
});

test('exposes the current filter and shows the first three names on keyboard focus', async () => {
  const root = await mount('failed', true);
  const link = root.querySelector('a')!;
  const tooltip = root.querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  const popup = tooltip.shadowRoot!.querySelector<HTMLElement>('[role="tooltip"]')!;
  const description = root.getElementById(link.getAttribute('aria-describedby')!)!;
  const preview = 'github.com/acme/gadget, github.com/acme/no-records, github.com/acme/overdue-final and 1 more';
  expect(link.getAttribute('aria-current')).toBe('true');
  expect(link.querySelector('.active-label')?.textContent).toBe('Current filter');
  expect(description.textContent).toBe(preview);
  expect(popup.hidden).toBe(true);
  link.focus();
  expect(root.activeElement).toBe(link);
  expect(popup.hidden).toBe(false);
  expect(popup.textContent?.trim()).toBe(preview);
});

test.each([
  ['failed', 'Fail', '0 Fail', 'dashboard-clear'],
  ['warning', 'Warn', '0 Warn', 'dashboard-clear'],
  ['not-run', 'Not run', '0 Not run', 'dashboard-clear'],
  ['passed', 'Pass', '0 Pass', 'dashboard-unsynced'],
] as const)('links the muted zero %s tile without a preview', async (status, label, name, fixture) => {
  const data = respond(`${fixtureTargets.repositoryOverview}?preview=${fixture}`)!.body as RepositoryOverview;
  const root = await mount(status, true, data.repositories);
  const link = root.querySelector('a:has(.outcome.muted)')!;
  expect(link.hasAttribute('data-route')).toBe(true);
  expect(link.getAttribute('href')).toBe(`/?status=${status}`);
  expect(link.getAttribute('aria-label')).toBe(name);
  expect(link.getAttribute('aria-current')).toBe('true');
  expect(link.textContent).toMatch(new RegExp(`0\\s+${label}`));
  expect(link.querySelector('.active-label')?.textContent).toBe('Current filter');
  expect(root.querySelector('pb-tooltip, [aria-describedby], #preview')).toBeNull();
});

// Verifies REQ-0004.
test('renders stored repository names as text in both descriptions', async () => {
  const repository = overview.repositories.find(entry => entry.repository.includes('<img'))!;
  const root = await mount('passed', false, [repository]);
  const tooltip = root.querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  expect(root.querySelector('a')?.getAttribute('aria-label')).toBe('1 Pass');
  expect(root.getElementById('preview')?.textContent).toBe(repository.repository);
  expect(tooltip.shadowRoot!.querySelector('.surface')?.textContent).toBe(repository.repository);
  expect(root.querySelector('img, b')).toBeNull();
  expect(tooltip.shadowRoot!.querySelector('img, b')).toBeNull();
});
