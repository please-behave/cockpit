// Verifies REQ-0004, REQ-0015, REQ-0016, REQ-0030 and REQ-0031.
import { afterEach, expect, test, vi } from 'vitest';
import { CockpitApp } from '../components/app';
import type { ReleaseSummary } from '../api/client';
import type { DataTable } from '../components/pb-data-table';
import type { RelativeTime } from '../components/pb-relative-time';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { RuleSetSummary } from '../components/pb-rule-set-summary';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { respond } from '../../../tools/preview/fixtures.mjs';
import type { ReleasesView } from './releases';
import { releasePath, repositoryPath, ruleSetPath } from './router';

const repository = 'github.com/acme/return-navigation';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockPreview() {
  const fetch = vi.fn(async (path: string) => {
    const fixture = respond(path)!;
    return Response.json(fixture.body, { status: fixture.status });
  });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  return fetch;
}

async function open(path: string) {
  window.history.replaceState(null, '', path);
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  return app;
}

async function loaded(app: CockpitApp) {
  const view = app.shadowRoot!.querySelector<ReleasesView>('pb-releases')!;
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-data-table')).not.toBeNull());
  return view;
}

test('lists the latest releases across pages with attention first and escapes stored text', async () => {
  const fetch = mockPreview();
  const app = await open('/releases');
  const { shadowRoot: root } = await loaded(app);
  expect(root!.querySelector('h1.assistive')?.textContent).toBe('Releases');
  const table = root!.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  expect(table.shadowRoot!.querySelector('caption.assistive')?.textContent).toBe('Releases');
  expect([...table.shadowRoot!.querySelectorAll('thead th')].map(cell => cell.textContent?.trim()))
    .toEqual(['Repository', 'Newest version', 'Reported', 'Evidence', 'Completed Rule Sets']);
  const rows = [...table.shadowRoot!.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(110);
  const names = rows.map(row => row.querySelector('th a')!.getAttribute('aria-label')!);
  expect(names.slice(0, 4)).toEqual([
    'github.com/acme/evidence-error', 'github.com/acme/failing-evidence', 'github.com/acme/missing-evidence',
    expect.stringMatching(/^github.com\/.{100,}/),
  ]);
  expect(names.slice(4)).toEqual(names.slice(4).sort((a, b) => a.localeCompare(b)));
  expect(names).not.toContain('github.com/acme/empty');
  const pills = rows.map(row => row.querySelector<StatusPill>('pb-status-pill')!);
  expect(pills.slice(0, 3).map(pill => pill.status)).toEqual(['ERROR', 'FAIL', 'No evidence']);
  expect(pills.every(pill => !pill.hasAttribute('variant'))).toBe(true);
  const noEvidence = pills[2];
  await noEvidence.updateComplete;
  expect(noEvidence.shadowRoot?.querySelector('pb-icon')?.getAttribute('name')).toBe('dash');
  expect(rows[2].querySelector<RuleSetSummary>('pb-rule-set-summary')!.sets).toEqual([]);

  const latest = rows[names.indexOf(repository)];
  const [deepLink, versionLink] = latest.querySelectorAll<HTMLAnchorElement>('a');
  expect(deepLink.textContent).toBe('return-navigation');
  expect(latest.querySelector('.repository-prefix')?.textContent).toBe('acme/');
  expect(versionLink.textContent).toBe('2.0');
  expect(versionLink.getAttribute('href')).toBe(releasePath(repository, '2.0'));
  const summary = latest.querySelector<RuleSetSummary>('pb-rule-set-summary')!;
  await summary.updateComplete;
  expect(summary.shadowRoot?.querySelector('button')?.textContent).toBe('2 Rule Sets');
  const chips = [...summary.shadowRoot!.querySelectorAll<RuleSetChip>('pb-rule-set-chip')];
  expect(chips.map(chip => chip.label)).toEqual([
    expect.stringMatching(/^Repository baseline · [0-9]+\.[0-9]+$/),
    expect.stringMatching(/Security and release readiness.* · [0-9]+\.[0-9]+$/),
  ]);
  expect(chips.map(chip => chip.href)).toEqual(summary.sets.map(set => ruleSetPath(set, set.version)));
  const recorded = latest.querySelector<RelativeTime>('pb-relative-time')!;
  await recorded.updateComplete;
  const tooltip = recorded.shadowRoot?.querySelector<Tooltip>('pb-tooltip')!;
  expect(tooltip.description).toContain('2026');
  expect(recorded.shadowRoot?.querySelector('time')?.getAttribute('datetime')).toBe(recorded.value);

  const markup = rows.find(row => row.querySelector('td a')?.textContent?.startsWith('release-<'))!;
  expect(markup.querySelector('td a')?.textContent?.length).toBeGreaterThan(200);
  expect(markup.querySelector('img')).toBeNull();
  const markupSummary = markup.querySelector<RuleSetSummary>('pb-rule-set-summary')!;
  await markupSummary.updateComplete;
  const chip = markupSummary.shadowRoot!.querySelector<RuleSetChip>('pb-rule-set-chip')!;
  await chip.updateComplete;
  expect(chip.shadowRoot?.querySelector('a')?.textContent).toContain('<img');
  expect(chip.shadowRoot?.querySelector('img')).toBeNull();

  const paths = fetch.mock.calls.map(([path]) => new URL(path, window.location.origin));
  expect(paths.map(path => path.pathname)).toEqual(['/v0/releases/latest', '/v0/releases/latest']);
  const cursor = JSON.parse(paths[1].searchParams.get('before')!);
  expect(cursor).toMatchObject({ repository: expect.stringContaining('project-'), version: '1.0' });

  deepLink.click();
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector('pb-repository')!;
  expect(window.location.pathname + window.location.search).toBe(repositoryPath(repository));
  await vi.waitFor(() => expect(view.shadowRoot?.activeElement?.textContent).toBe('return-navigation'));
  expect(app.shadowRoot!.querySelector('pb-app-shell')!.shadowRoot!.querySelector('pb-refresh-status')).toBeNull();
});

// Verifies REQ-0020.
test('refreshes both release pages in place and retains the sorted list if a later page fails', async () => {
  let version = '2.0';
  let fail = false;
  const fetch = vi.fn(async (path: string) => {
    const { body, status } = respond(path)!;
    const query = new URL(path, window.location.origin).searchParams;
    if (fail && query.has('before')) return Response.json({}, { status: 503 });
    return Response.json((body as ReleaseSummary[]).map(entry =>
      entry.repository === repository ? { ...entry, version } : entry), { status });
  });
  vi.stubGlobal('fetch', fetch);
  const app = await open('/releases');
  const view = await loaded(app);
  const table = view.shadowRoot!.querySelector<DataTable>('pb-data-table')!;
  const rows = () => [...table.shadowRoot!.querySelectorAll('tbody tr')];
  const order = () => rows().map(row => row.querySelector('th a')!.getAttribute('aria-label'));
  const displayedVersion = () => rows().find(row => row.querySelector('th a')!.getAttribute('aria-label') === repository)
    ?.querySelector('td a')?.textContent;
  const shell = app.shadowRoot!.querySelector('pb-app-shell')!.shadowRoot!;
  await vi.waitFor(() => expect(rows()).toHaveLength(110));
  const refresh = shell.querySelector('pb-refresh-status')!.shadowRoot!.querySelector('button')!;
  const initialOrder = order();

  version = '3.0';
  refresh.focus();
  refresh.click();
  await vi.waitFor(() => expect(displayedVersion()).toBe('3.0'));
  expect(order()).toEqual(initialOrder);
  expect(refresh.getRootNode()).toHaveProperty('activeElement', refresh);

  version = '4.0';
  fail = true;
  refresh.click();
  await vi.waitFor(() => expect(view.shadowRoot!.textContent).toContain('Showing the last data received'));
  expect(order()).toEqual(initialOrder);
  expect(displayedVersion()).toBe('3.0');
  const requests = fetch.mock.calls.map(([path]) => path);
  expect(requests).toEqual([...requests.slice(0, 2), ...requests.slice(0, 2), ...requests.slice(0, 2)]);
});

test('explains an empty release overview', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
  const app = await open('/releases');
  const root = app.shadowRoot!.querySelector('pb-releases')!.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelector('pb-empty-state')).not.toBeNull());
  expect(root.querySelector('pb-empty-state')).toHaveProperty('message', 'No release has been recorded yet.');
  expect(root.querySelector('pb-data-table')).toBeNull();
});
