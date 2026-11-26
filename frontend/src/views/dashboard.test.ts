import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, completedRuleSets, repositoryOverview, type RepositoryOverview, type RepositoryOverviewEntry } from '../api/client';
import type { ErrorState } from '../components/pb-error-state';
import type { RepositoryTile } from '../components/pb-repository-tile';
import type { CockpitTime } from '../components/pb-time';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { Tooltip } from '../components/pb-tooltip';
import { DashboardView } from './dashboard';

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

async function mount() {
  const view = new DashboardView();
  document.body.append(view);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('.tiles, pb-empty-state, pb-error-state')).not.toBeNull());
  await view.updateComplete;
  return view;
}

const tiles = (view: DashboardView) =>
  [...view.shadowRoot!.querySelectorAll<RepositoryTile>('ul.tiles > li > pb-repository-tile')];
const names = (view: DashboardView) => tiles(view).map(tile => tile.entry!.repository);

// Verifies REQ-0004, REQ-0015 and REQ-0028.
test('shows only the completed sets for each repository and escapes the full name', async () => {
  const name = '<img src=x onerror=alert(1)> Shared security rules';
  const set = { source: 'github.com/acme/rules', path: 'sets/security', id: 'security', version: '1.0', name };
  overview.mockResolvedValue(repositories(entry('a/one'), entry('a/two')));
  completed.mockResolvedValue([{ repository: 'a/one', sets: [
    set, { ...set, id: 'licensing', name: 'Licensing' },
  ] }]);
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.textContent === name ? 300 : 0;
  });

  const view = await mount();
  for (const tile of tiles(view)) {
    const chips = [...tile.shadowRoot!.querySelectorAll<RuleSetChip>('pb-rule-set-chip')];
    expect(chips.map(chip => chip.label)).toEqual(tile.entry!.repository === 'a/one'
      ? [name, 'Licensing'] : []);
    if (!chips.length) {
      expect(tile.shadowRoot!.querySelector('.sets')).toBeNull();
      continue;
    }
    const [long, short] = chips;
    await vi.waitFor(() => expect(long.shadowRoot!.querySelector('pb-tooltip')).not.toBeNull());
    const tooltip = long.shadowRoot!.querySelector<Tooltip>('pb-tooltip')!;
    await tooltip.updateComplete;
    expect(long.shadowRoot!.querySelector('.chip')?.textContent).toBe(name);
    expect(tooltip.shadowRoot!.querySelector('[role=tooltip]')?.textContent?.trim()).toBe(name);
    expect(long.shadowRoot!.querySelector('img')).toBeNull();
    const query = new URLSearchParams({ source: set.source, path: set.path, id: set.id, version: set.version });
    expect(long.shadowRoot!.querySelector('a[data-route]')?.getAttribute('href')).toBe(`/rule-sets/detail?${query}`);
    expect(tooltip.shadowRoot!.querySelector('img')).toBeNull();
    expect(short.shadowRoot!.querySelector('pb-tooltip')).toBeNull();
  }

  completed.mockResolvedValue([]);
  view.refresh();
  await vi.waitFor(() => {
    expect(completed).toHaveBeenCalledTimes(2);
    expect(tiles(view).every(tile => tile.shadowRoot!.querySelector('.sets') === null)).toBe(true);
  });
});

// Verifies REQ-0019.
test('has a loading state, then an explicit empty state without header and tiles', async () => {
  let complete!: (data: RepositoryOverview) => void;
  overview.mockReturnValue(new Promise<RepositoryOverview>(resolve => { complete = resolve; }));
  const view = new DashboardView();
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
  expect(root.querySelector('[role=status], .tiles, .summary, fieldset')).toBeNull();
});

test('shows each overview repository once and counts all health categories', async () => {
  overview.mockResolvedValue(fixtures);
  completed.mockResolvedValue([{
    repository: 'github.com/acme/archived',
    sets: [{ source: 'source', path: '', id: 'archived', version: '1.0', name: 'Archived' }],
  }]);
  const view = await mount();
  const root = view.shadowRoot!;
  const banner = root.querySelector('.banner')!;
  expect(banner.classList.contains('failed')).toBe(true);
  expect(banner.querySelector('fieldset legend')?.textContent).toBe('Sort by');
  const counts = [...banner.querySelectorAll('.counts li')];
  expect(counts.map(count => count.textContent?.trim().replace(/\s+/g, ' ')))
    .toEqual(['× 4 failed', '▲ 1 warning', '○ 3 unknown', '✓ 3 passed']);
  expect(counts.every(count => count.querySelector('[aria-hidden=true]'))).toBe(true);
  expect(banner.querySelector<CockpitTime>('.sync pb-time')?.value).toBe(fixtures.heartbeat.completed_at);
  expect(banner.querySelector('.sync')?.textContent).toContain('(stale)');

  expect(names(view).filter(name => name === 'github.com/acme/widget')).toHaveLength(1);
  expect(names(view)).toHaveLength(new Set(names(view)).size);
  expect(names(view)).not.toContain('github.com/acme/archived');
  expect(root.querySelector('.tiles')?.getAttribute('aria-label')).toBe('Repositories');
});

test('sorts by severity by default, with time and name available through the URL', async () => {
  overview.mockResolvedValue(repositories(
    { ...entry('a/zeta', '2026-11-20T00:00:00Z'), state: 'never_integrated', latest_check: null },
    entry('a/beta', '2026-11-22T00:00:00Z'),
    entry('a/alpha', '2026-11-21T00:00:00Z'),
  ));
  const view = await mount();
  expect(names(view)).toEqual(['a/zeta', 'a/alpha', 'a/beta']);
  expect(view.shadowRoot!.querySelector('.sync')?.textContent?.trim()).toBe('No covering sync has completed.');
  const radios = [...view.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type=radio]')];
  expect(radios.map(radio => radio.checked)).toEqual([true, false, false]);

  const entries = window.history.length;
  radios[1].click();
  await view.updateComplete;
  expect(window.location.search).toBe('?sort=time');
  expect(names(view)).toEqual(['a/beta', 'a/alpha', 'a/zeta']);
  radios[2].click();
  await view.updateComplete;
  expect(window.location.search).toBe('?sort=name');
  expect(window.history.length).toBe(entries);
  expect(names(view)).toEqual(['a/alpha', 'a/beta', 'a/zeta']);

  radios[0].click();
  await view.updateComplete;
  expect(window.location.search).toBe('');
  expect(names(view)[0]).toBe('a/zeta');

  view.remove();
  window.history.replaceState(null, '', '/?sort=name');
  const reloaded = await mount();
  expect(names(reloaded)[0]).toBe('a/alpha');
  expect([...reloaded.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type=radio]')].map(radio => radio.checked))
    .toEqual([false, false, true]);

  reloaded.remove();
  window.history.replaceState(null, '', '/?sort=bogus');
  expect(names(await mount())[0]).toBe('a/zeta');
});

test('compares names ignoring case, with code points as tie-break', async () => {
  window.history.replaceState(null, '', '/?sort=name');
  overview.mockResolvedValue(repositories(...[
    'a/b', 'a/B', 'a/', 'Zed', 'alpha', 'Beta', 'foo', 'Foo', 'zz-ä', 'zz-z', 'zz-😀',
  ].map(name => entry(name))));
  expect(names(await mount())).toEqual([
    'a/', 'a/B', 'a/b', 'alpha', 'Beta', 'Foo', 'foo', 'Zed', 'zz-z', 'zz-ä', 'zz-😀',
  ]);
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
test('refreshes every 5 minutes while visible, keeps focus, sort and tiles, and keys tiles', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const reports = [entry('a/one'), entry('a/two')];
  overview.mockResolvedValue(repositories(...reports));
  const view = await mount();
  const [firstTile] = tiles(view);
  const link = firstTile.shadowRoot!.querySelector<HTMLAnchorElement>('a.repository')!;
  link.focus();
  expect(overview).toHaveBeenCalledTimes(1);

  overview.mockResolvedValue(repositories(reports[0], {
    ...reports[1], latest_check: { ...reports[1].latest_check!, id: 'new', overall: 'FAIL' },
  }));
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(names(view)).toEqual(['a/two', 'a/one']));
  expect(overview).toHaveBeenCalledTimes(2);
  expect(tiles(view)[1]).toBe(firstTile);
  expect(view.shadowRoot!.activeElement).toBe(firstTile);
  expect(firstTile.shadowRoot!.activeElement).toBe(link);
  expect(window.location.search).toBe('');
  expect(view.shadowRoot!.querySelector('[role=status]')).toBeNull();

  overview.mockRejectedValue(new ApiError('ledger_unavailable'));
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]')?.textContent).toContain('could not be refreshed'));
  expect(tiles(view)).toHaveLength(2);
  expect(view.shadowRoot!.querySelector('pb-error-state')).toBeNull();
  expect(view.shadowRoot!.activeElement).toBe(firstTile);
  expect(firstTile.shadowRoot!.activeElement).toBe(link);

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
