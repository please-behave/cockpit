import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, completedRuleSets, latestAttestations, type Summary } from '../api/client';
import type { ErrorState } from '../components/pb-error-state';
import type { RepositoryTile } from '../components/pb-repository-tile';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { Tooltip } from '../components/pb-tooltip';
import { DashboardView } from './dashboard';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  latestAttestations: vi.fn(),
  completedRuleSets: vi.fn(),
}));

const latest = vi.mocked(latestAttestations);
const completed = vi.mocked(completedRuleSets);

const summary = (id: string, overall: Summary['overall'], repository: string,
  execution_points = ['check'], received_at = '2026-11-22T11:18:19Z'): Summary => ({
  id,
  overall,
  repository,
  execution_points,
  received_at,
  sender: 'sender',
  commit: '0123456789abcdef',
  warn_count: 2,
  not_run_count: 3,
  result_count: 7,
});

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
const hrefs = (view: DashboardView) =>
  tiles(view).map(tile => tile.shadowRoot!.querySelector('a.repository')!.getAttribute('href'));

// Verifies REQ-0004, REQ-0015 and REQ-0028.
test('shows only the completed sets for each repository and escapes the full name', async () => {
  const name = '<img src=x onerror=alert(1)> Shared security rules';
  const set = { source: 'github.com/acme/rules', path: 'sets/security', id: 'security', version: '1.0', name };
  latest.mockResolvedValue([
    summary('1', 'PASS', 'a/one', ['check']),
    summary('2', 'PASS', 'a/one', ['deploy']),
    summary('3', 'PASS', 'a/two'),
  ]);
  completed.mockResolvedValue([{ repository: 'a/one', sets: [
    set, { ...set, id: 'licensing', name: 'Licensing' },
  ] }]);
  vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
    return this.textContent === name ? 300 : 0;
  });

  const view = await mount();
  for (const tile of tiles(view)) {
    const chips = [...tile.shadowRoot!.querySelectorAll<RuleSetChip>('pb-rule-set-chip')];
    expect(chips.map(chip => chip.label)).toEqual(tile.summary!.repository === 'a/one'
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
  let complete!: (summaries: Summary[]) => void;
  latest.mockReturnValue(new Promise<Summary[]>(resolve => { complete = resolve; }));
  const view = new DashboardView();
  document.body.append(view);
  await view.updateComplete;
  const root = view.shadowRoot!;
  expect(root.querySelector('[role=status]')?.textContent).toBe('Loading…');
  expect(root.activeElement).toBe(root.querySelector('h1'));
  expect(document.title).toBe('Dashboard | Please Behave');

  complete([]);
  await vi.waitFor(() => expect(root.querySelector('pb-empty-state')).not.toBeNull());
  expect(root.querySelector('pb-empty-state')!.getAttribute('message'))
    .toBe('No attestations have been reported yet.');
  expect(root.querySelector('[role=status], .tiles, .summary, fieldset')).toBeNull();
});

test('states the overall state in a banner with text and icon for passing and failing tiles', async () => {
  latest.mockResolvedValue([
    summary('1', 'PASS', 'a/one'), summary('2', 'FAIL', 'a/two'),
    summary('3', 'ERROR', 'a/three'), summary('4', 'PASS', 'a/four'),
  ]);
  const view = await mount();
  const root = view.shadowRoot!;
  const banner = root.querySelector('.banner')!;
  expect(banner.querySelector('fieldset legend')?.textContent).toBe('Sort by');
  expect(banner.querySelector('h2')!.textContent).toBe('2 not passing, 2 passing');
  expect(banner.classList.contains('failed')).toBe(true);
  expect(banner.querySelector('.icon')!.textContent).toBe('×');
  expect(banner.querySelector('.icon')!.getAttribute('aria-hidden')).toBe('true');
  expect(root.querySelector('.figure')).toBeNull();

  latest.mockResolvedValue([summary('1', 'PASS', 'a/one'), summary('2', 'PASS', 'a/two')]);
  await view.load();
  await vi.waitFor(() => expect(root.querySelector('h2')!.textContent).toBe('All 2 passing'));
  expect(root.querySelector('.banner')!.classList.contains('passed')).toBe(true);
  expect(root.querySelector('.banner .icon')!.textContent).toBe('✓');
});

test('arranges one tile per combination and shows execution points only for repeated repositories', async () => {
  const reports = [
    summary('first', 'FAIL', 'github.com/acme/widget', ['deploy'], '2026-11-22T12:00:00Z'),
    summary('other', 'PASS', 'github.com/acme/widget', ['check']),
    summary('solo', 'PASS', 'github.com/acme/solo'),
  ];
  latest.mockResolvedValue(reports);
  const view = await mount();
  expect(tiles(view).map(tile => [tile.summary, tile.showExecutionPoints])).toEqual([
    [reports[0], true], [reports[2], false], [reports[1], true],
  ]);
  expect(view.shadowRoot!.textContent).not.toContain('shown as reported');
});

test('sorts by last attestation by default and by name through the URL', async () => {
  latest.mockResolvedValue([
    summary('old', 'PASS', 'a/zeta', ['x'], '2026-11-20T00:00:00Z'),
    summary('new', 'PASS', 'a/beta', ['x'], '2026-11-22T00:00:00Z'),
    summary('mid-b', 'PASS', 'a/alpha', ['y'], '2026-11-21T00:00:00Z'),
    summary('mid-a', 'PASS', 'a/alpha', ['x'], '2026-11-21T00:00:00Z'),
  ]);
  const view = await mount();
  expect(hrefs(view)).toEqual(['/attestations/new', '/attestations/mid-a', '/attestations/mid-b', '/attestations/old']);
  const radios = [...view.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type=radio]')];
  expect(radios.map(radio => radio.checked)).toEqual([true, false]);
  expect(view.shadowRoot!.querySelector('legend')!.textContent).toBe('Sort by');

  const entries = window.history.length;
  radios[1].click();
  await view.updateComplete;
  expect(window.location.search).toBe('?sort=name');
  expect(window.history.length).toBe(entries);
  expect(hrefs(view)).toEqual(['/attestations/mid-a', '/attestations/mid-b', '/attestations/new', '/attestations/old']);

  radios[0].click();
  await view.updateComplete;
  expect(window.location.search).toBe('');
  expect(hrefs(view)[0]).toBe('/attestations/new');

  view.remove();
  window.history.replaceState(null, '', '/?sort=name');
  const reloaded = await mount();
  expect(hrefs(reloaded)[0]).toBe('/attestations/mid-a');
  expect([...reloaded.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type=radio]')].map(radio => radio.checked))
    .toEqual([false, true]);

  reloaded.remove();
  window.history.replaceState(null, '', '/?sort=bogus');
  const fallback = await mount();
  expect(hrefs(fallback)[0]).toBe('/attestations/new');
});

test('compares names ignoring case, with code points as tie-break', async () => {
  window.history.replaceState(null, '', '/?sort=name');
  latest.mockResolvedValue([
    summary('lower', 'PASS', 'a/b'), summary('upper', 'PASS', 'a/B'), summary('short', 'PASS', 'a/'),
    summary('zed', 'PASS', 'Zed'), summary('alpha', 'PASS', 'alpha'), summary('beta', 'PASS', 'Beta'),
    summary('foo-lower', 'PASS', 'foo'), summary('foo-upper', 'PASS', 'Foo'),
    summary('umlaut', 'PASS', 'zz-\u00e4'), summary('ascii', 'PASS', 'zz-z'),
    summary('astral', 'PASS', 'zz-\u{1F600}'),
  ]);
  expect(hrefs(await mount())).toEqual([
    '/attestations/short', '/attestations/upper', '/attestations/lower',
    '/attestations/alpha', '/attestations/beta',
    '/attestations/foo-upper', '/attestations/foo-lower',
    '/attestations/zed', '/attestations/ascii', '/attestations/umlaut', '/attestations/astral',
  ]);
});

// Verifies REQ-0003.
test('shows a ledger error without upstream details and retries', async () => {
  latest.mockRejectedValueOnce(new ApiError('ledger_unavailable')).mockResolvedValueOnce([]);
  const view = await mount();
  const error = view.shadowRoot!.querySelector<ErrorState>('pb-error-state')!;
  await error.updateComplete;
  expect(error.heading).toBe('Ledger unavailable');
  expect(error.message).toBe('Cockpit could not load data from the ledger.');

  error.shadowRoot!.querySelector('button')!.click();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-empty-state')).not.toBeNull());
  expect(latest).toHaveBeenCalledTimes(2);
  expect(view.shadowRoot!.activeElement).toBe(view.shadowRoot!.querySelector('h1'));
});

function setVisibility(state: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

// Verifies REQ-0020.
test('refreshes every 5 minutes while visible, keeps focus, sort and tiles, and keys tiles', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  window.history.replaceState(null, '', '/?sort=name');
  const reports = [summary('a', 'PASS', 'a/one'), summary('b', 'PASS', 'a/two')];
  latest.mockResolvedValue(reports);
  const view = await mount();
  const [firstTile] = tiles(view);
  const link = firstTile.shadowRoot!.querySelector<HTMLAnchorElement>('a.repository')!;
  link.focus();
  expect(latest).toHaveBeenCalledTimes(1);

  latest.mockResolvedValue(reports.map(report => ({ ...report, id: `${report.id}2`, result_count: 9 })));
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(tiles(view)[0].shadowRoot!.textContent).toContain('9 rules'));
  expect(latest).toHaveBeenCalledTimes(2);
  expect(tiles(view)[0]).toBe(firstTile);
  expect(view.shadowRoot!.activeElement).toBe(firstTile);
  expect(firstTile.shadowRoot!.activeElement).toBe(link);
  expect(window.location.search).toBe('?sort=name');
  expect(view.shadowRoot!.querySelector('[role=status]')).toBeNull();

  latest.mockRejectedValue(new ApiError('ledger_unavailable'));
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]')?.textContent).toContain('could not be refreshed'));
  expect(tiles(view)).toHaveLength(2);
  expect(view.shadowRoot!.querySelector('pb-error-state')).toBeNull();
  expect(view.shadowRoot!.activeElement).toBe(firstTile);
  expect(firstTile.shadowRoot!.activeElement).toBe(link);

  latest.mockResolvedValue(reports);
  await vi.advanceTimersByTimeAsync(300_000);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]')).toBeNull());

  view.remove();
  const calls = latest.mock.calls.length;
  await vi.advanceTimersByTimeAsync(600_000);
  expect(latest).toHaveBeenCalledTimes(calls);
});

test('does nothing while hidden and refreshes when shown after more than 5 minutes', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  latest.mockResolvedValue([summary('a', 'PASS', 'a/one')]);
  await mount();

  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(600_000);
  expect(latest).toHaveBeenCalledTimes(1);

  setVisibility('visible');
  await vi.waitFor(() => expect(latest).toHaveBeenCalledTimes(2));

  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(60_000);
  setVisibility('visible');
  expect(latest).toHaveBeenCalledTimes(2);
});
