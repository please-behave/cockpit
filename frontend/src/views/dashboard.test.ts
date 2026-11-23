import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, latestAttestations, type Summary } from '../api/client';
import type { ErrorState } from '../components/pb-error-state';
import type { RelativeTime } from '../components/pb-relative-time';
import { formatTime } from '../components/pb-time';
import type { ShortName } from '../components/pb-short-name';
import type { StatusPill } from '../components/pb-status-pill';
import { DashboardView } from './dashboard';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  latestAttestations: vi.fn(),
}));

const latest = vi.mocked(latestAttestations);

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

beforeEach(() => window.history.replaceState(null, '', '/'));

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.resetAllMocks();
});

async function mount() {
  const view = new DashboardView();
  document.body.append(view);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('.tiles, pb-empty-state, pb-error-state')).not.toBeNull());
  await view.updateComplete;
  return view;
}

const tiles = (view: DashboardView) => [...view.shadowRoot!.querySelectorAll<HTMLElement>('.tile')];
const hrefs = (view: DashboardView) => tiles(view).map(tile => tile.querySelector('a.repository')!.getAttribute('href'));

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
  expect(root.querySelector('[role=status], .tiles, .header, fieldset')).toBeNull();
});

test('states the overall state with text and icon for passing and failing tiles', async () => {
  latest.mockResolvedValue([
    summary('1', 'PASS', 'a/one'), summary('2', 'FAIL', 'a/two'),
    summary('3', 'ERROR', 'a/three'), summary('4', 'PASS', 'a/four'),
  ]);
  const view = await mount();
  const root = view.shadowRoot!;
  expect(root.querySelector('h2')!.textContent).toBe('2 of 4 not passing');
  const figures = [...root.querySelectorAll('.figure')];
  expect(figures.map(figure => figure.textContent!.replace(/\s+/g, ' ').trim()))
    .toEqual(['✓ 2 passing', '× 2 not passing']);
  expect(figures.every(figure => figure.querySelector('[aria-hidden=true]'))).toBe(true);

  latest.mockResolvedValue([summary('1', 'PASS', 'a/one'), summary('2', 'PASS', 'a/two')]);
  await view.load();
  await vi.waitFor(() => expect(root.querySelector('h2')!.textContent).toBe('All 2 passing'));
});

test('shows one tile per combination with its content', async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-22T12:05:00Z') });
  const report = { ...summary('first?query', 'FAIL', 'github.com/acme/widget', ['deploy'], '2026-11-22T12:00:00Z'),
    warn_count: 1, result_count: 1, not_run_count: 0 };
  latest.mockResolvedValue([report, summary('other', 'PASS', 'github.com/acme/widget', ['check']),
    summary('solo', 'PASS', 'github.com/acme/solo')]);
  const view = await mount();
  const [first, solo] = tiles(view);
  expect(first.querySelector<StatusPill>('pb-status-pill')!.status).toBe('FAIL');
  expect(first.querySelector('.owner')!.textContent).toBe('acme');
  const repository = first.querySelector<HTMLAnchorElement>('a.repository')!;
  expect(repository.getAttribute('href')).toBe('/attestations/first%3Fquery');
  expect(repository.hasAttribute('data-route')).toBe(true);
  expect(repository.querySelector<ShortName>('pb-short-name')!.value).toBe('github.com/acme/widget');
  expect(first.textContent).toContain('1 rule · 1 warning · 0 not run');
  expect(view.shadowRoot!.textContent).not.toContain('shown as reported');
  for (const tile of tiles(view)) {
    const relative = tile.querySelector<RelativeTime>('pb-relative-time')!;
    expect(relative.parentElement!.textContent!.trim()).toBe('Reported');
  }
  const relative = first.querySelector<RelativeTime>('pb-relative-time')!;
  await relative.updateComplete;
  const time = relative.shadowRoot!.querySelector('time')!;
  expect(time.textContent).toBe('5 minutes ago');
  expect(time.dateTime).toBe(report.received_at);
  expect(time.title).toBe(formatTime(new Date(report.received_at)));
  expect(first.textContent).toContain('deploy');
  expect(solo.textContent).not.toContain('check');
  expect(solo.textContent).toContain('7 rules · 2 warnings · 3 not run');
});

test('links the commit externally only for a github.com repository value', async () => {
  latest.mockResolvedValue([
    summary('a', 'PASS', 'github.com/acme/widget'),
    summary('b', 'PASS', 'gitlab.com/acme/widget'),
    summary('c', 'PASS', 'github.com/acme/widget/<script>'),
  ]);
  const view = await mount();
  const external = (tile: HTMLElement) => tile.querySelector<HTMLAnchorElement>('a.commit');
  const all = tiles(view).map(external);
  expect(all.filter(Boolean)).toHaveLength(1);
  const link = all.find(Boolean)!;
  expect(link.getAttribute('href')).toBe('https://github.com/acme/widget/commit/0123456789abcdef');
  expect(link.target).toBe('_blank');
  expect(link.rel).toBe('noopener noreferrer');
  expect(link.querySelector('code')!.textContent).toBe('0123456');
  expect(link.textContent).toContain('(opens in a new tab)');
  expect(tiles(view).filter(tile => !external(tile)).every(tile => tile.querySelector('code')!.textContent === '0123456'))
    .toBe(true);
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
test('refreshes every 60 seconds while visible, keeps focus, sort and tiles, and keys tiles', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  window.history.replaceState(null, '', '/?sort=name');
  const reports = [summary('a', 'PASS', 'a/one'), summary('b', 'PASS', 'a/two')];
  latest.mockResolvedValue(reports);
  const view = await mount();
  const [firstTile] = tiles(view);
  const link = firstTile.querySelector<HTMLAnchorElement>('a.repository')!;
  link.focus();
  expect(latest).toHaveBeenCalledTimes(1);

  latest.mockResolvedValue(reports.map(report => ({ ...report, id: `${report.id}2`, warn_count: 9 })));
  await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(() => expect(tiles(view)[0].textContent).toContain('9 warnings'));
  expect(latest).toHaveBeenCalledTimes(2);
  expect(tiles(view)[0]).toBe(firstTile);
  expect(view.shadowRoot!.activeElement).toBe(link);
  expect(window.location.search).toBe('?sort=name');
  expect(view.shadowRoot!.querySelector('[role=status]')).toBeNull();

  latest.mockRejectedValue(new ApiError('ledger_unavailable'));
  await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]')?.textContent).toContain('could not be refreshed'));
  expect(tiles(view)).toHaveLength(2);
  expect(view.shadowRoot!.querySelector('pb-error-state')).toBeNull();
  expect(view.shadowRoot!.activeElement).toBe(link);

  latest.mockResolvedValue(reports);
  await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]')).toBeNull());

  view.remove();
  const calls = latest.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(latest).toHaveBeenCalledTimes(calls);
});

test('does nothing while hidden and refreshes when shown after more than a minute', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  latest.mockResolvedValue([summary('a', 'PASS', 'a/one')]);
  await mount();

  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(180_000);
  expect(latest).toHaveBeenCalledTimes(1);

  setVisibility('visible');
  await vi.waitFor(() => expect(latest).toHaveBeenCalledTimes(2));

  setVisibility('hidden');
  await vi.advanceTimersByTimeAsync(30_000);
  setVisibility('visible');
  expect(latest).toHaveBeenCalledTimes(2);
});
