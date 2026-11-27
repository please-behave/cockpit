import { render } from 'lit';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  ApiError, attestationPage, completedRuleSets, newestDeployments, newestReleases, repositoryOverview,
  type Deployment, type ReleaseSummary, type RepositoryOverview, type RepositoryOverviewEntry, type Summary,
} from '../api/client';
import type { ActivityFeed } from '../components/pb-activity-feed';
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
  attestationPage: vi.fn(),
  newestReleases: vi.fn(),
  newestDeployments: vi.fn(),
}));

const overview = vi.mocked(repositoryOverview);
const completed = vi.mocked(completedRuleSets);
const attestations = vi.mocked(attestationPage);
const releases = vi.mocked(newestReleases);
const deployments = vi.mocked(newestDeployments);
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
  attestations.mockResolvedValue([]);
  releases.mockResolvedValue([]);
  deployments.mockResolvedValue([]);
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
    'pb-widget', 'pb-needs-attention', 'pb-activity-feed', 'pb-repository-map',
  ]);
  const counts = tiles(view).map(tile => tile.shadowRoot!.querySelector('.tile')!.textContent!.trim().replace(/\s+/g, ' '));
  expect(counts).toEqual(['4 failed', '1 warning', '3 unknown', '3 passed']);
  expect(names(view)).toHaveLength(fixtures.repositories.length);
  expect(names(view)).toHaveLength(new Set(names(view)).size);
  expect(names(view)).not.toContain('github.com/acme/archived');
});

const activityFixtures = {
  attestations: respond('/v0/attestations?limit=10')!.body as Summary[],
  releases: respond('/v0/releases/latest?limit=10')!.body as ReleaseSummary[],
  deployments: respond('/v0/deployments?limit=10')!.body as Deployment[],
};

const feed = (view: DashboardView) => view.shadowRoot!.querySelector<ActivityFeed>('pb-activity-feed')!;
const feedRows = (view: DashboardView) => [...feed(view).shadowRoot!.querySelectorAll('li')]
  .map(row => row.textContent!.replace(/\s+/g, ' ').trim());

// Verifies REQ-0019 and REQ-0020.
test('reads the three kinds with a small limit together with the overview and merges them', async () => {
  overview.mockResolvedValue(fixtures);
  attestations.mockResolvedValue(activityFixtures.attestations.slice(0, 10));
  releases.mockResolvedValue(activityFixtures.releases.slice(0, 10));
  deployments.mockResolvedValue(activityFixtures.deployments.slice(0, 10));
  const view = await mount();
  await feed(view).updateComplete;

  expect(attestations).toHaveBeenCalledWith({ limit: 10 }, expect.any(AbortSignal));
  expect(releases).toHaveBeenCalledWith(10, expect.any(AbortSignal));
  expect(deployments).toHaveBeenCalledWith(10, expect.any(AbortSignal));
  expect(feed(view).entries).toHaveLength(10);
  expect(feed(view).failed).toEqual([]);
  const times = feed(view).entries.map(entry => Date.parse(entry.receivedAt));
  expect(times).toEqual([...times].sort((left, right) => right - left));
});

test('shows the other kinds and a notice when one read fails, and keeps the entries of a failing refresh', async () => {
  overview.mockResolvedValue(fixtures);
  attestations.mockResolvedValue(activityFixtures.attestations.slice(0, 3));
  releases.mockRejectedValue(new ApiError('ledger_unavailable'));
  deployments.mockResolvedValue(activityFixtures.deployments.slice(0, 3));
  const view = await mount();
  await feed(view).updateComplete;
  expect(feed(view).entries).toHaveLength(6);
  expect(feed(view).entries.some(entry => entry.kind === 'release')).toBe(false);
  expect(feed(view).failed).toEqual(['release']);
  expect(feed(view).shadowRoot!.querySelector('[role=status]')?.textContent)
    .toBe('Could not read the latest releases. The feed may be incomplete or outdated.');

  releases.mockResolvedValue(activityFixtures.releases.slice(0, 2));
  view.refresh();
  await vi.waitFor(() => expect(feed(view).entries.filter(entry => entry.kind === 'release')).toHaveLength(2));
  expect(feed(view).failed).toEqual([]);

  releases.mockRejectedValue(new ApiError('timeout'));
  deployments.mockRejectedValue(new ApiError('timeout'));
  view.refresh();
  await vi.waitFor(() => expect(feed(view).failed).toEqual(['release', 'deployment']));
  expect(feed(view).entries).toHaveLength(8);
  expect(feedRows(view)).toHaveLength(8);
});

test('shows an empty feed as a message without a notice', async () => {
  overview.mockResolvedValue(fixtures);
  const view = await mount();
  await feed(view).updateComplete;
  expect(feed(view).shadowRoot!.querySelector('p')?.textContent).toBe('No attestations, releases or deployments have been received.');
  expect(feed(view).shadowRoot!.querySelector('[role=status]')).toBeNull();
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

test('keeps the organization heading and full counts when the filter hides every other section', async () => {
  overview.mockResolvedValue(fixtures);
  const view = await mount('?status=warning');
  expect(names(view)).toEqual(['github.com/acme/widget']);
  const root = map(view).shadowRoot!;
  expect([...root.querySelectorAll('h3')].map(heading => heading.textContent)).toEqual(['acme']);
  expect([...root.querySelectorAll('.counts span')].map(span => span.textContent)).toEqual([
    '3 failed', '1 warning', '3 unknown', '2 passed',
  ]);
  expect(map(view).link).toEqual({ href: '/', label: 'Clear status filter' });
});

test.each([
  ['failed', 'dashboard-clear'],
  ['warning', 'dashboard-clear'],
  ['not-run', 'dashboard-clear'],
  ['passed', 'dashboard-unsynced'],
])('explains an empty %s filter and offers a clear link', async (status, fixture) => {
  const data = respond(`${fixtureTargets.repositoryOverview}?preview=${fixture}`)!.body as RepositoryOverview;
  overview.mockResolvedValue(data);
  const view = await mount(`?preview=${fixture}&status=${status}`);
  expect(chips(view)).toHaveLength(0);
  expect(map(view).shadowRoot!.querySelector('p')?.textContent).toBe('No repositories match this status.');
  expect(map(view).link).toEqual({ href: `/?preview=${fixture}`, label: 'Clear status filter' });
  const active = tiles(view).find(tile => tile.active)!;
  expect(active.status).toBe(status);
  expect(active.shadowRoot!.querySelector('a.empty[aria-current="true"]')?.getAttribute('href'))
    .toBe(`/?preview=${fixture}&status=${status}`);
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

// Verifies REQ-0020.
test('refreshes at the stored interval and applies a changed interval from then on', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  localStorage.setItem('cockpit-refresh-interval', '30000');
  overview.mockResolvedValue(repositories(entry('a/one')));
  const view = await mount();

  const states: RefreshState[] = [];
  view.addEventListener('refresh-state', event => states.push((event as CustomEvent<RefreshState>).detail));

  await vi.advanceTimersByTimeAsync(29_000);
  expect(overview).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2_000);
  await vi.waitFor(() => expect(overview).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(states.at(-1)?.interval).toBe(30_000));

  view.setRefreshInterval(10_000);
  expect(localStorage.getItem('cockpit-refresh-interval')).toBe('10000');
  await vi.advanceTimersByTimeAsync(11_000);
  await vi.waitFor(() => expect(overview).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(states.at(-1)?.interval).toBe(10_000));

  view.setRefreshInterval(1234);
  expect(localStorage.getItem('cockpit-refresh-interval')).toBe('10000');
  localStorage.clear();
});

// Verifies REQ-0020.
test('refreshes at the default interval without usable storage', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  overview.mockResolvedValue(repositories(entry('a/one')));
  const view = await mount();
  await vi.advanceTimersByTimeAsync(299_000);
  expect(overview).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(2_000);
  await vi.waitFor(() => expect(overview).toHaveBeenCalledTimes(2));
  expect(() => view.setRefreshInterval(30_000)).not.toThrow();
});
