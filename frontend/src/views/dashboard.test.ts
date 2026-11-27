import { render } from 'lit';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, completedRuleSets, repositoryOverview, type RepositoryOverview, type RepositoryOverviewEntry } from '../api/client';
import type { ErrorState } from '../components/pb-error-state';
import type { NeedsAttention } from '../components/pb-needs-attention';
import type { RepoChip } from '../components/pb-repo-chip';
import type { RepositoryMap } from '../components/pb-repository-map';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { StatTile } from '../components/pb-stat-tile';
import type { RelativeTime } from '../components/pb-relative-time';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import type { RefreshState } from './cockpit-view';
import { DashboardView } from './dashboard';
import { ruleSetPath } from './router';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  repositoryOverview: vi.fn(),
  completedRuleSets: vi.fn(),
}));

const overview = vi.mocked(repositoryOverview);
const completed = vi.mocked(completedRuleSets);
const fixtures = respond(fixtureTargets.repositoryOverview)!.body as RepositoryOverview;

function entry(repository: string, received_at = '2026-11-22T11:18:19Z'): RepositoryOverviewEntry {
  const current = fixtures.repositories.find(item => item.state === 'current' && item.latest_check?.overall === 'PASS')!;
  return { ...current, repository, latest_check: { ...current.latest_check!, received_at } };
}

function repositories(...entries: RepositoryOverviewEntry[]): RepositoryOverview {
  return { heartbeat: { completed_at: null, stale: true }, repositories: entries };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  completed.mockResolvedValue([]);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

async function mount(search = '') {
  const view = new DashboardView();
  view.search = search;
  document.body.append(view);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('.widgets, pb-empty-state, pb-error-state')).not.toBeNull());
  await view.updateComplete;
  return view;
}

const map = (view: DashboardView) => view.shadowRoot!.querySelector<RepositoryMap>('pb-repository-map')!;
const chips = (view: DashboardView) => [...map(view).shadowRoot!.querySelectorAll<RepoChip>('pb-repo-chip')];
const names = (view: DashboardView) => chips(view).map(chip => chip.entry!.repository);
const tiles = (view: DashboardView) => [...view.shadowRoot!.querySelectorAll<StatTile>('pb-stat-tile')];

// Verifies REQ-0028.
test('passes completed sets to the matching map preview and clears them on refresh', async () => {
  const set = { source: 'github.com/acme/rules', path: 'sets/security', id: 'security', version: '1.0', name: 'Security' };
  overview.mockResolvedValue(repositories(entry('a/one'), entry('a/two')));
  completed.mockResolvedValue([{ repository: 'a/one', sets: [set] }]);

  const view = await mount();
  const [one, two] = chips(view);
  const link = one.shadowRoot!.querySelector<RuleSetChip>('pb-rule-set-chip')!;
  expect(link.href).toBe(ruleSetPath(set, set.version));
  expect(two.shadowRoot!.querySelector('pb-rule-set-chip')).toBeNull();

  completed.mockResolvedValue([]);
  view.refresh();
  await vi.waitFor(() => {
    expect(completed).toHaveBeenCalledTimes(2);
    expect(one.shadowRoot!.querySelector('pb-rule-set-chip')).toBeNull();
  });
});

// Verifies REQ-0019.
test('shows loading and then the empty state, with sync status available to the toolbar', async () => {
  let complete!: (data: RepositoryOverview) => void;
  overview.mockReturnValue(new Promise<RepositoryOverview>(resolve => { complete = resolve; }));
  const view = new DashboardView();
  const toolbar = document.createElement('div');
  view.addEventListener('refresh-state', event => render((event as CustomEvent<RefreshState>).detail.toolbar, toolbar));
  document.body.append(view);
  await view.updateComplete;
  const root = view.shadowRoot!;
  expect(root.querySelector('[role=status]')?.textContent).toBe('Loading…');
  expect(root.activeElement).toBe(root.querySelector('h1'));
  expect(document.title).toBe('Dashboard | Please Behave');

  complete(repositories());
  await vi.waitFor(() => expect(root.querySelector('pb-empty-state')).not.toBeNull());
  expect(root.querySelector('pb-empty-state')!.getAttribute('message'))
    .toBe('The ledger has no repositories to show.');
  expect(root.querySelector('[role=status], .widgets')).toBeNull();
  expect(toolbar.textContent).toBe('No covering sync has completed.');
});

test('counts the overview and composes the widgets in reading order', async () => {
  overview.mockResolvedValue(fixtures);
  const view = await mount();
  const root = view.shadowRoot!;
  expect([...root.querySelector('.widgets')!.children].map(node => node.localName)).toEqual([
    'pb-widget', 'pb-needs-attention', 'pb-repository-map',
  ]);
  const counts = tiles(view).map(tile => tile.shadowRoot!.querySelector('.tile')!.textContent!.trim().replace(/\s+/g, ' '));
  expect(counts).toEqual(['4 failed', '1 warning', '3 unknown', '3 passed']);
  expect(names(view)).toHaveLength(fixtures.repositories.length);
  expect(names(view)).toHaveLength(new Set(names(view)).size);
  expect(names(view)).not.toContain('github.com/acme/archived');
});

test.each([
  ['failed', 4], ['warning', 1], ['not-run', 3], ['passed', 3], ['bogus', 11],
])('filters only the map for status=%s', async (status, count) => {
  overview.mockResolvedValue(fixtures);
  const view = await mount(`?status=${status}`);
  expect(chips(view)).toHaveLength(count);
  const attention = view.shadowRoot!.querySelector<NeedsAttention>('pb-needs-attention')!;
  expect(attention.repositories).toBe(fixtures.repositories);
  expect(tiles(view).every(tile => tile.repositories === fixtures.repositories)).toBe(true);
  expect(tiles(view).find(tile => tile.active)?.status).toBe(status === 'bogus' ? undefined : status);
});

test('explains an empty filtered map and offers a clear link', async () => {
  overview.mockResolvedValue(repositories(entry('a/one')));
  const view = await mount('?status=failed');
  expect(chips(view)).toHaveLength(0);
  expect(map(view).shadowRoot!.querySelector('p')?.textContent).toBe('No repositories match this status.');
  expect(map(view).link).toEqual({ href: '/', label: 'Clear status filter' });
  const [failed] = tiles(view);
  expect(failed.shadowRoot!.querySelector('a')).toBeNull();
  expect(failed.shadowRoot!.textContent).toContain('Current filter');
});

test('shows the covering sync and stale state in the toolbar template', async () => {
  overview.mockResolvedValue(fixtures);
  const view = new DashboardView();
  const toolbar = document.createElement('div');
  view.addEventListener('refresh-state', event => render((event as CustomEvent<RefreshState>).detail.toolbar, toolbar));
  document.body.append(view);
  await vi.waitFor(() => expect(toolbar.textContent).toContain('(stale)'));
  expect(toolbar.querySelector<RelativeTime>('pb-relative-time')?.value).toBe(fixtures.heartbeat.completed_at);
});

// Verifies REQ-0003.
test('shows a ledger error without upstream details and retries', async () => {
  overview.mockRejectedValueOnce(new ApiError('ledger_unavailable')).mockResolvedValueOnce(repositories());
  const view = await mount();
  const error = view.shadowRoot!.querySelector<ErrorState>('pb-error-state')!;
  await error.updateComplete;
  expect(error.heading).toBe('Ledger unavailable');
  expect(error.message).toBe('Cockpit could not load data from the ledger.');

  error.shadowRoot!.querySelector('button')!.click();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-empty-state')).not.toBeNull());
  expect(overview).toHaveBeenCalledTimes(2);
  expect(view.shadowRoot!.activeElement).toBe(view.shadowRoot!.querySelector('h1'));
});

function setVisibility(state: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

// Verifies REQ-0020.
test('refreshes every 5 minutes while visible, keeps focus and the active filter on a keyed map chip', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const reports = [entry('a/one'), entry('a/two')];
  overview.mockResolvedValue(repositories(...reports));
  const view = await mount('?status=passed');
  const [firstChip] = chips(view);
  const link = firstChip.shadowRoot!.querySelector<HTMLAnchorElement>('a.chip')!;
  link.focus();
  expect(overview).toHaveBeenCalledTimes(1);

  overview.mockResolvedValue(repositories(reports[0], {
    ...reports[1], latest_check: { ...reports[1].latest_check!, id: 'new', overall: 'FAIL' },
  }));
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(names(view)).toEqual(['a/one']));
  expect(overview).toHaveBeenCalledTimes(2);
  expect(chips(view)[0]).toBe(firstChip);
  expect(map(view).shadowRoot!.activeElement).toBe(firstChip);
  expect(firstChip.shadowRoot!.activeElement).toBe(link);
  expect(view.search).toBe('?status=passed');
  expect(view.shadowRoot!.querySelector('[role=status]')).toBeNull();

  overview.mockRejectedValue(new ApiError('ledger_unavailable'));
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]')?.textContent).toContain('could not be refreshed'));
  expect(chips(view)).toHaveLength(1);
  expect(view.shadowRoot!.querySelector('pb-error-state')).toBeNull();
  expect(map(view).shadowRoot!.activeElement).toBe(firstChip);
  expect(firstChip.shadowRoot!.activeElement).toBe(link);

  overview.mockResolvedValue(repositories(...reports));
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]')).toBeNull());

  view.remove();
  const calls = overview.mock.calls.length;
  await vi.advanceTimersByTimeAsync(600_000);
  expect(overview).toHaveBeenCalledTimes(calls);
});

test('does nothing while hidden and refreshes when shown after more than 5 minutes', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  overview.mockResolvedValue(repositories(entry('a/one')));
  await mount();

  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(600_000);
  expect(overview).toHaveBeenCalledTimes(1);

  setVisibility('visible');
  await vi.waitFor(() => expect(overview).toHaveBeenCalledTimes(2));

  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(60_000);
  setVisibility('visible');
  expect(overview).toHaveBeenCalledTimes(2);
});
