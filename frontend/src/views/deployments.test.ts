// Verifies REQ-0004, REQ-0015, REQ-0016 and REQ-0034.
import { afterEach, expect, test, vi } from 'vitest';
import { CockpitApp } from '../components/app';
import type { DataTable } from '../components/pb-data-table';
import type { RuleSetSummary } from '../components/pb-rule-set-summary';
import type { RelativeTime } from '../components/pb-relative-time';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { respond } from '../../../tools/preview/fixtures.mjs';
import type { DeploymentsView } from './deployments';
import { releasePath, repositoryPath, ruleSetPath } from './router';

const repository = 'github.com/acme/return-navigation';
const owner = 'github.com/acme/infrastructure';
const production = JSON.stringify([owner, 'production']);

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockPreview() {
  const fetch = vi.fn(async (path: string) => {
    const { body, status } = respond(path)!;
    return Response.json(body, { status });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function open() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', '/deployments');
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<DeploymentsView>('pb-deployments')!;
  await view.updateComplete;
  return { app, view, root: view.shadowRoot! };
}

function table(root: ParentNode) {
  return root.querySelector<DataTable>('pb-data-table');
}

function rows(root: ParentNode) {
  return [...(table(root)?.shadowRoot?.querySelectorAll<HTMLTableRowElement>('tbody tr:has(td)') ?? [])];
}

function statuses(root: ParentNode) {
  return rows(root).map(row => row.querySelector<StatusPill>('pb-status-pill')!.status);
}

test('shows all pages grouped by target with the worst evidence first', async () => {
  const fetch = mockPreview();
  const { root } = await open();
  await vi.waitFor(() => expect(rows(root)).toHaveLength(115));
  expect(root.activeElement).toBe(root.querySelector('h1.assistive'));
  expect(root.querySelector('h1')?.textContent).toBe('Deployments');
  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    '/v0/deployments?limit=100', '/v0/deployments?limit=100&before=16',
  ]);
  const grid = table(root)!.shadowRoot!;
  expect([...grid.querySelectorAll('thead th')].map(cell => cell.textContent?.trim()))
    .toEqual(['Repository', 'Version or commit', 'Recorded', 'Evidence', 'Completed Rule Sets']);
  const groups = [...grid.querySelectorAll('tbody')];
  expect(groups.length).toBeGreaterThan(100);
  const group = groups[0];
  const heading = group.querySelector('th[scope="rowgroup"]')!;
  expect(heading.textContent).toContain(owner + ' · production');
  expect(heading.querySelector('pb-status-pill')).toHaveProperty('status', 'ERROR');
  expect(heading.textContent).toContain('1 of 4');
  expect([...group.querySelectorAll('td pb-status-pill')].map(pill => (pill as StatusPill).status))
    .toEqual(['ERROR', 'FAIL', 'No evidence', 'PASS']);
  expect(groups.some(group => group.querySelector('th')?.textContent?.includes('github.com/acme/other-infrastructure · production'))).toBe(true);

  expect(rows(root).some(row => row.querySelector('th a')!.textContent!.length > 100)).toBe(true);
  expect(rows(root).some(row => row.cells[1].textContent!.includes('<img'))).toBe(true);
  expect(grid.querySelector('img')).toBeNull();
  const pass = group.rows[group.rows.length - 1];
  expect(pass.cells[0].querySelector('a')?.getAttribute('href')).toBe(repositoryPath(repository));
  expect(pass.cells[1].querySelector('a')?.getAttribute('href')).toBe(releasePath(repository, '2.0'));
  const summary = pass.querySelector<RuleSetSummary>('pb-rule-set-summary')!;
  await summary.updateComplete;
  expect(summary.shadowRoot?.querySelector('button')?.textContent).toBe('2 Rule Sets');
  const chips = [...summary.shadowRoot!.querySelectorAll<RuleSetChip>('pb-rule-set-chip')];
  expect(chips.map(chip => chip.label)).toEqual([
    expect.stringContaining('Repository baseline'), expect.stringContaining('Security and release readiness'),
  ]);
  expect(chips.map(chip => chip.href)).toEqual(summary.sets.map(set => ruleSetPath(set, set.version)));
  const time = pass.querySelector<RelativeTime>('pb-relative-time')!;
  await time.updateComplete;
  expect(time.shadowRoot?.querySelector('time')?.dateTime).toBe(time.value);

  const commit = grid.querySelector<Tooltip>('pb-tooltip:has(code)')!;
  expect(commit.querySelector('code')?.textContent).toBe(commit.description.slice(0, 7));
  const missing = rows(root).find(row => row.cells[1].textContent?.trim() === 'v3.0')!;
  expect(missing.querySelector('pb-status-pill')).toHaveProperty('status', 'release not recorded');
  expect(missing.cells[1].querySelector('a')).toBeNull();
  expect(missing.querySelector('pb-rule-set-summary')).toHaveProperty('sets', []);
  for (const [status, icon] of [
    ['ERROR', 'error'], ['FAIL', 'cross'], ['release not recorded', 'circle'], ['No evidence', 'dash'], ['PASS', 'check'],
  ]) {
    const pill = [...grid.querySelectorAll<StatusPill>('td pb-status-pill')].find(pill => pill.status === status)!;
    await pill.updateComplete;
    expect(pill.shadowRoot?.textContent).toContain(status);
    expect(pill.shadowRoot?.querySelector('pb-icon')?.getAttribute('name')).toBe(icon);
  }
});

test('changes grouping and combines labelled filters without losing focus', async () => {
  const fetch = mockPreview();
  const { view, root } = await open();
  await vi.waitFor(() => expect(root.querySelectorAll('select')).toHaveLength(4));
  const selects = [...root.querySelectorAll('select')];
  expect(selects.map(control => control.labels?.[0].firstChild?.textContent?.trim()))
    .toEqual(['Group by', 'Target', 'Repository', 'Evidence status']);
  expect(selects[0].value).toBe('target');

  async function change(control: HTMLSelectElement, value: string) {
    control.focus();
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await view.updateComplete;
    await table(root)?.updateComplete;
    expect(root.activeElement).toBe(control);
    expect(control.value).toBe(value);
  }

  await change(selects[0], 'repository');
  const grid = table(root)!.shadowRoot!;
  expect(grid.querySelector('thead th')?.textContent?.trim()).toBe('Target');
  const heading = grid.querySelector(`th[scope="rowgroup"] a[href="${repositoryPath(repository)}"]`)!;
  expect(heading.textContent).toBe(repository);
  const repositoryGroup = heading.closest('tbody')!;
  expect(repositoryGroup.rows.length).toBeGreaterThan(100);
  expect(repositoryGroup.rows[1].cells[0].textContent?.trim()).toBe(owner + ' · rollback');
  await change(selects[1], production);
  expect(statuses(root)).toEqual(['ERROR', 'FAIL', 'No evidence', 'PASS']);
  await change(selects[2], repository);
  expect(statuses(root)).toEqual(['PASS']);
  expect(root.querySelector('[role="status"]')?.textContent).toBe('1 matching deployment');
  await change(selects[3], 'No evidence');
  expect(root.querySelector('pb-empty-state')?.getAttribute('heading')).toBe('No matching deployments');
  expect(root.querySelector('[role="status"]')?.textContent).toBe('0 matching deployments');
  await change(selects[2], '');
  expect(statuses(root)).toEqual(['No evidence']);
  expect(table(root)?.shadowRoot?.querySelector('th[scope="rowgroup"] pb-status-pill')).toHaveProperty('status', 'No evidence');
  await change(selects[1], '');
  await change(selects[3], 'release not recorded');
  expect(statuses(root)).toEqual(['release not recorded', 'release not recorded']);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('follows a recorded version link to its release detail', async () => {
  mockPreview();
  const { app, root } = await open();
  await vi.waitFor(() => expect(rows(root).length).toBeGreaterThan(0));
  const path = releasePath(repository, '2.0');
  table(root)!.shadowRoot!.querySelector<HTMLAnchorElement>(`a[href="${path}"]`)!.click();
  await app.updateComplete;
  expect(window.location.pathname + window.location.search).toBe(path);
  expect(app.shadowRoot!.querySelector('pb-release')).not.toBeNull();
});

test('explains an empty overview and allows retry after a failed read', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json([]));
  vi.stubGlobal('fetch', fetch);
  const { root } = await open();
  await vi.waitFor(() => expect(root.querySelector('pb-error-state')).not.toBeNull());
  root.querySelector('pb-error-state')!.dispatchEvent(new Event('retry'));
  await vi.waitFor(() => expect(root.querySelector('pb-empty-state')?.getAttribute('heading')).toBe('No deployments'));
  expect(root.querySelector('select')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
