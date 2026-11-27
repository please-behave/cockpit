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
  ['failed', 'cross', '4', 'failed', '4 failed repositories'],
  ['warning', 'warning', '1', 'warning', '1 repository with a warning'],
  ['not-run', 'circle', '3', 'unknown', '3 unknown repositories'],
  ['passed', 'check', '3', 'passed', '3 passed repositories'],
] as const)('shows the %s group and links to its filter', async (status, symbol, count, label, name) => {
  const root = await mount(status);
  const link = root.querySelector('a')!;
  expect(link.getAttribute('href')).toBe(`/?status=${status}`);
  expect(link.getAttribute('aria-label')).toBe(name);
  expect(link.hasAttribute('aria-current')).toBe(false);
  expect(link.querySelector('pb-icon')?.getAttribute('name')).toBe(symbol);
  expect(link.querySelector('.count')?.textContent).toBe(count);
  expect(link.querySelector('.count + span')?.textContent).toBe(label);
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

test('shows zero as muted text without a link or tooltip', async () => {
  const emptyWarning = respond(`${fixtureTargets.repositoryOverview}?preview=stat-tiles`)!.body as RepositoryOverview;
  const root = await mount('warning', true, emptyWarning.repositories);
  expect(root.querySelector('.empty')?.textContent).toMatch(/0\s+warning/);
  expect(root.querySelector('.active-label')?.textContent).toBe('Current filter');
  expect(root.querySelector('a, pb-tooltip, button')).toBeNull();
});

// Verifies REQ-0004.
test('renders stored repository names as text in both descriptions', async () => {
  const repository = overview.repositories.find(entry => entry.repository.includes('<img'))!;
  const root = await mount('passed', false, [repository]);
  const tooltip = root.querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  expect(root.querySelector('a')?.getAttribute('aria-label')).toBe('1 passed repository');
  expect(root.getElementById('preview')?.textContent).toBe(repository.repository);
  expect(tooltip.shadowRoot!.querySelector('.surface')?.textContent).toBe(repository.repository);
  expect(root.querySelector('img, b')).toBeNull();
  expect(tooltip.shadowRoot!.querySelector('img, b')).toBeNull();
});
