import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApiError, attestationPage, type Summary } from '../api/client';
import type { CommitLink } from '../components/pb-commit-link';
import type { DataTable } from '../components/pb-data-table';
import type { ErrorState } from '../components/pb-error-state';
import type { StatusPill } from '../components/pb-status-pill';
import type { RelativeTime } from '../components/pb-relative-time';
import { HistoryView } from './history';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  attestationPage: vi.fn(),
}));

const page = vi.mocked(attestationPage);

let observers: MockObserver[];

class MockObserver {
  readonly observed = new Set<Element>();
  constructor(readonly callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) {
    observers.push(this);
  }
  observe(element: Element) { this.observed.add(element); }
  unobserve(element: Element) { this.observed.delete(element); }
  disconnect() { this.observed.clear(); }
  reach() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

const summary = (n: number, repository = 'github.com/acme/widget'): Summary => ({
  id: `id-${String(n).padStart(4, '0')}`,
  overall: n % 2 ? 'FAIL' : 'PASS',
  repository,
  execution_points: ['check'],
  received_at: '2026-11-22T11:18:19Z',
  sender: 'sender',
  commit: '0123456789abcdef',
  warn_count: 0,
  not_run_count: 0,
  result_count: 1,
});

const range = (from: number, count: number) => Array.from({ length: count }, (_, index) => summary(from + index));

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', MockObserver);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

async function mount() {
  const view = new HistoryView();
  document.body.append(view);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-data-table, pb-empty-state, pb-error-state')).not.toBeNull());
  await view.updateComplete;
  return view;
}

async function tableRoot(view: HistoryView) {
  const table = view.shadowRoot!.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  return table.shadowRoot!;
}

const hrefs = (view: HistoryView) => [...view.shadowRoot!.querySelectorAll('pb-data-table')]
  .flatMap(table => [...table.shadowRoot!.querySelectorAll<RelativeTime>('tbody td pb-relative-time')])
  .map(time => time.shadowRoot?.querySelector('a[data-route]')?.getAttribute('href'));

async function rowCount(view: HistoryView) {
  const root = await tableRoot(view);
  return root.querySelectorAll('tbody tr').length;
}

const sentinel = (view: HistoryView) => view.shadowRoot!.querySelector('.sentinel')!;
const announcement = (view: HistoryView) => view.shadowRoot!.querySelector('.assistive[role=status]')?.textContent;

async function reach(view: HistoryView) {
  observers.at(-1)!.reach();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]:not(.assistive)')).toBeNull());
  await view.updateComplete;
}

// Verifies REQ-0021.
test('loads the first page of 100, shows the loading state and the heading', async () => {
  let complete!: (summaries: Summary[]) => void;
  page.mockReturnValue(new Promise<Summary[]>(resolve => { complete = resolve; }));
  const view = new HistoryView();
  document.body.append(view);
  await view.updateComplete;
  const root = view.shadowRoot!;
  expect(root.querySelector('[role=status]')?.textContent).toBe('Loading…');
  expect(root.activeElement).toBe(root.querySelector('h1'));
  expect(document.title).toBe('Attestations | Please Behave');
  expect(page).toHaveBeenCalledWith({ limit: 100 }, expect.any(AbortSignal));

  complete(range(1, 100));
  await vi.waitFor(() => expect(root.querySelector('pb-data-table')).not.toBeNull());
  expect(root.querySelector('[role=status]:not(.assistive)')).toBeNull();
  expect(root.textContent).not.toContain('shown as reported');
});

// Verifies REQ-0021.
test('shows one row per attestation with its columns, links and tooltips', async () => {
  const report = { ...summary(1, 'github.com/acme/widget'), id: 'first?query', received_at: '2026-11-22T12:00:00Z' };
  page.mockResolvedValue([report, summary(2, 'gitlab.com/acme/other')]);
  const view = await mount();
  const root = await tableRoot(view);
  expect(root.querySelector('caption.assistive')?.textContent).toBe('Attestations');
  expect([...root.querySelectorAll('thead th')].map(cell => cell.textContent?.trim()))
    .toEqual(['Repository', 'Overall', 'Reported', 'Commit']);
  expect([...root.querySelectorAll('thead th')].map(cell => cell.className)).toEqual(['fill', 'content', 'content', 'content']);

  const [first, second] = [...root.querySelectorAll('tbody tr')];
  const time = first.querySelector<RelativeTime>('pb-relative-time')!;
  expect(time.value).toBe('2026-11-22T12:00:00Z');
  await time.updateComplete;
  const timestamp = time.shadowRoot!.querySelector('time')!;
  expect(timestamp.textContent).toMatch(/ago$|^just now$/);
  expect(timestamp.dateTime).toBe(report.received_at);
  expect(timestamp.hasAttribute('title')).toBe(false);

  const reported = timestamp.closest('a[data-route]')!;
  expect(reported.getAttribute('href')).toBe('/attestations/first%3Fquery');
  const exactTime = reported.getAttribute('aria-description');
  expect(exactTime).toContain('2026-11-22T12:00:00.000Z (UTC)');
  expect(reported.parentElement).toMatchObject({ localName: 'pb-tooltip', externalTrigger: true, description: exactTime });
  const link = first.querySelector<HTMLAnchorElement>('pb-tooltip > a[data-route]')!;
  expect(link.getAttribute('href')).toBe('/repositories/detail?repository=github.com%2Facme%2Fwidget');
  expect(link.textContent).toBe('widget');
  expect(link.getAttribute('aria-label')).toBe('github.com/acme/widget');
  expect(first.querySelector('.repository-prefix')?.textContent).toBe('acme/');
  expect(link.parentElement).toMatchObject({ localName: 'pb-tooltip', description: report.repository });

  const commit = first.querySelector<CommitLink>('pb-commit-link')!;
  await commit.updateComplete;
  const external = commit.shadowRoot!.querySelector<HTMLAnchorElement>('a')!;
  expect(external.getAttribute('href')).toBe('https://github.com/acme/widget/commit/0123456789abcdef');
  expect(external.target).toBe('_blank');
  expect(external.rel).toBe('noopener noreferrer');
  expect(external.querySelector('code')!.textContent).toBe('0123456');
  expect(external.textContent).toContain('(opens in a new tab)');

  const plain = second.querySelector<CommitLink>('pb-commit-link')!;
  await plain.updateComplete;
  expect(plain.shadowRoot!.querySelector('a')).toBeNull();
  expect(plain.shadowRoot!.querySelector('code')!.textContent).toBe('0123456');

  expect([...root.querySelectorAll<StatusPill>('pb-status-pill')].map(pill => pill.status)).toEqual(['FAIL', 'PASS']);
});

// Verifies REQ-0021.
test('has an explicit empty state without table and sentinel', async () => {
  page.mockResolvedValue([]);
  const view = await mount();
  const root = view.shadowRoot!;
  expect(root.querySelector('pb-empty-state')!.getAttribute('message'))
    .toBe('No attestations have been reported yet.');
  expect(root.querySelector('pb-data-table, .sentinel')).toBeNull();
});

// Verifies REQ-0022.
test('loads follow-up pages with the cursor until a short page ends the list', async () => {
  page.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => summary(1000 - i)));
  const view = await mount();
  expect(observers).toHaveLength(1);
  expect(observers[0].options).toEqual({
    root: null,
    rootMargin: `0px 0px ${window.innerHeight}px`,
  });
  expect(observers[0].observed.has(sentinel(view))).toBe(true);
  expect(announcement(view)).toBe('100 attestations loaded.');
  const lastOfFirst = 'id-0901';
  expect(page.mock.calls).toHaveLength(1);

  page.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => summary(900 - i)));
  await reach(view);
  expect(page).toHaveBeenLastCalledWith({ before: lastOfFirst, limit: 100 }, expect.any(AbortSignal));
  expect(await rowCount(view)).toBe(200);
  expect(announcement(view)).toBe('200 attestations loaded.');

  page.mockResolvedValueOnce([summary(800), summary(799)]);
  await reach(view);
  expect(page).toHaveBeenLastCalledWith({ before: 'id-0801', limit: 100 }, expect.any(AbortSignal));
  expect(await rowCount(view)).toBe(202);
  expect(view.shadowRoot!.textContent).not.toContain('No older attestations exist.');
  expect(view.shadowRoot!.querySelector('[role=status]:not(.assistive)')).toBeNull();
  expect(announcement(view)).toBe('All 202 attestations loaded.');

  observers[0].reach();
  await view.updateComplete;
  expect(page).toHaveBeenCalledTimes(3);
  expect(new Set(hrefs(view)).size).toBe(202);
  expect(hrefs(view)[0]).toBe('/attestations/id-1000');
  expect(hrefs(view).at(-1)).toBe('/attestations/id-0799');
  const header = (await tableRoot(view)).querySelector('thead')!;
  expect(header.querySelector('button')).toBeNull();
  const sorted = header.querySelector('[aria-sort="descending"]')!;
  expect(sorted.textContent?.trim()).toBe('Reported');
  expect(sorted.querySelector('pb-icon')?.getAttribute('name')).toBe('sort-descending');
});

// Verifies REQ-0022.
test('announces a short first page as the end without a visible message', async () => {
  page.mockResolvedValue(range(1, 1));
  const view = await mount();
  expect(view.shadowRoot!.textContent).not.toContain('No older attestations exist.');
  expect(view.shadowRoot!.querySelector('[role=status]:not(.assistive)')).toBeNull();
  expect(announcement(view)).toBe('All 1 attestation loaded.');
  observers[0].reach();
  await view.updateComplete;
  expect(page).toHaveBeenCalledTimes(1);
});

// Verifies REQ-0022.
test('shows rows that arrive twice once and keeps their order', async () => {
  const firstPage = Array.from({ length: 100 }, (_, i) => summary(500 - i));
  page.mockResolvedValueOnce(firstPage);
  const view = await mount();
  page.mockResolvedValueOnce([summary(401), summary(400), ...Array.from({ length: 98 }, (_, i) => summary(399 - i))]);
  await reach(view);
  expect(await rowCount(view)).toBe(199);
  expect(new Set(hrefs(view)).size).toBe(199);
  expect(hrefs(view).slice(98, 101)).toEqual(['/attestations/id-0402', '/attestations/id-0401', '/attestations/id-0400']);
  expect(page).toHaveBeenLastCalledWith({ before: 'id-0401', limit: 100 }, expect.any(AbortSignal));
});

// Verifies REQ-0022.
test('stops when a full page adds no new row instead of asking for it again', async () => {
  const firstPage = Array.from({ length: 100 }, (_, i) => summary(500 - i));
  page.mockResolvedValueOnce(firstPage);
  const view = await mount();
  page.mockResolvedValueOnce(firstPage);
  await reach(view);
  expect(await rowCount(view)).toBe(100);
  expect(announcement(view)).toBe('All 100 attestations loaded.');
  observers[0].reach();
  await view.updateComplete;
  expect(page).toHaveBeenCalledTimes(2);
});

// Verifies REQ-0022.
test('loads one page at a time and checks the sentinel again after each page', async () => {
  page.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => summary(900 - i)));
  const view = await mount();
  let complete!: (summaries: Summary[]) => void;
  page.mockReturnValueOnce(new Promise<Summary[]>(resolve => { complete = resolve; }));
  observers[0].reach();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]:not(.assistive)')?.textContent)
    .toBe('Loading older attestations…'));
  observers[0].reach();
  expect(page).toHaveBeenCalledTimes(2);
  expect(announcement(view)).toBe('');
  const rows = await rowCount(view);

  complete([summary(800)]);
  await vi.waitFor(() => expect(announcement(view)).toBe('All 101 attestations loaded.'));
  expect(await rowCount(view)).toBe(rows + 1);
  expect(observers[0].observed.has(sentinel(view))).toBe(true);
});

// Verifies REQ-0022.
test('keeps loaded rows on a failed later page, offers an inline retry and continues', async () => {
  page.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => summary(900 - i)));
  const view = await mount();
  page.mockRejectedValueOnce(new ApiError('ledger_unavailable'));
  observers[0].reach();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-error-state')).not.toBeNull());
  const error = view.shadowRoot!.querySelector<ErrorState>('pb-error-state')!;
  await error.updateComplete;
  expect(error.heading).toBe('Older attestations unavailable');
  expect(await rowCount(view)).toBe(100);
  expect(view.shadowRoot!.querySelector('[role=status]:not(.assistive)')).toBeNull();
  expect(announcement(view)).toBe('');

  observers[0].reach();
  await view.updateComplete;
  expect(page).toHaveBeenCalledTimes(2);

  page.mockResolvedValueOnce([summary(800)]);
  error.shadowRoot!.querySelector('button')!.click();
  await vi.waitFor(() => expect(announcement(view)).toBe('All 101 attestations loaded.'));
  expect(view.shadowRoot!.querySelector('pb-error-state')).toBeNull();
  expect(await rowCount(view)).toBe(101);
  expect(page).toHaveBeenLastCalledWith({ before: 'id-0801', limit: 100 }, expect.any(AbortSignal));
});

// Verifies REQ-0003.
test('shows the existing error state for a failed first page and retries it', async () => {
  page.mockRejectedValueOnce(new ApiError('ledger_unavailable')).mockResolvedValueOnce(range(1, 2));
  const view = await mount();
  const error = view.shadowRoot!.querySelector<ErrorState>('pb-error-state')!;
  await error.updateComplete;
  expect(error.heading).toBe('Ledger unavailable');
  expect(view.shadowRoot!.querySelector('.sentinel, pb-data-table')).toBeNull();

  error.shadowRoot!.querySelector('button')!.click();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-data-table')).not.toBeNull());
  expect(await rowCount(view)).toBe(2);
  expect(view.shadowRoot!.activeElement).toBe(view.shadowRoot!.querySelector('h1'));
});

// Verifies REQ-0022.
test('abandons a pending page when the view is removed', async () => {
  page.mockResolvedValueOnce(Array.from({ length: 100 }, (_, i) => summary(900 - i)));
  const view = await mount();
  page.mockReturnValueOnce(new Promise(() => {}));
  observers[0].reach();
  await vi.waitFor(() => expect(page).toHaveBeenCalledTimes(2));
  view.remove();
  expect(page.mock.calls[1][1].aborted).toBe(true);
  expect(observers[0].observed.size).toBe(0);
});

// Verifies REQ-0020 and REQ-0022.
test('a refresh prepends entries without re-anchoring the page or dropping loaded rows', async () => {
  page.mockResolvedValueOnce(range(2, 100)).mockResolvedValueOnce(range(102, 20));
  const view = await mount();
  await reach(view);
  expect(await rowCount(view)).toBe(120);

  page.mockResolvedValueOnce([summary(1), ...range(2, 99)]);
  await view.refresh();
  await vi.waitFor(() => expect(hrefs(view)[0]).toBe('/attestations/id-0001'));
  expect(hrefs(view)).toHaveLength(121);
  const sheet = view.shadowRoot!.adoptedStyleSheets.at(-1)!;
  expect([...sheet.cssRules].some(rule => /:host\s*\{\s*overflow-anchor:\s*none/.test(rule.cssText))).toBe(true);
  expect(hrefs(view)[1]).toBe('/attestations/id-0002');
  expect(page).toHaveBeenLastCalledWith({ limit: 100 }, expect.any(AbortSignal));
  expect(view.shadowRoot!.querySelector('[role=status]:not(.assistive)')).toBeNull();
});

// Verifies REQ-0022.
test('a refresh page without a loaded entry replaces the list', async () => {
  page.mockResolvedValueOnce(range(500, 100)).mockResolvedValueOnce(range(600, 20));
  const view = await mount();
  await reach(view);
  expect(await rowCount(view)).toBe(120);

  page.mockResolvedValueOnce(range(1, 100));
  view.refresh();
  await vi.waitFor(() => expect(hrefs(view)[0]).toBe('/attestations/id-0001'));
  expect(hrefs(view)).toHaveLength(100);
  expect(announcement(view)).toBe('100 attestations loaded.');
});

// Verifies REQ-0022.
test('a failed refresh keeps the loaded entries and shows the notice', async () => {
  page.mockResolvedValueOnce(range(1, 100));
  const view = await mount();
  page.mockRejectedValueOnce(new ApiError('ledger_unavailable'));
  view.refresh();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('[role=status]:not(.assistive)')?.textContent)
    .toContain('could not be refreshed'));
  expect(await rowCount(view)).toBe(100);
  expect(view.shadowRoot!.querySelector('pb-error-state')).toBeNull();
});
