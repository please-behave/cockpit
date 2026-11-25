// Verifies REQ-0004, REQ-0015, REQ-0016, REQ-0030 and REQ-0031.
import { afterEach, expect, test, vi } from 'vitest';
import { CockpitApp } from '../components/app';
import type { RelativeTime } from '../components/pb-relative-time';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { respond } from '../../../tools/preview/fixtures.mjs';
import type { ReleasesView } from './releases';
import { repositoryReleasesPath, routeFor } from './router';

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
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('.releases')).not.toBeNull());
  return view;
}

test('lists the latest releases across pages with attention first and escapes stored text', async () => {
  const fetch = mockPreview();
  const app = await open('/releases');
  const { shadowRoot: root } = await loaded(app);
  expect(root!.querySelector('h1.assistive')?.textContent).toBe('Releases');
  const rows = [...root!.querySelectorAll('.release')];
  expect(rows).toHaveLength(108);
  const names = rows.map(row => row.querySelector('h2')!.textContent!.trim());
  expect(names.slice(0, 3)).toEqual([
    'github.com/acme/evidence-error', 'github.com/acme/failing-evidence', 'github.com/acme/missing-evidence',
  ]);
  expect(names.slice(3)).toEqual(names.slice(3).sort((a, b) => a.localeCompare(b)));
  expect(names).not.toContain('github.com/acme/empty');
  expect(rows.slice(0, 3).map(row => row.querySelector<StatusPill>('pb-status-pill')!.status))
    .toEqual(['ERROR', 'FAIL', 'No evidence']);
  const noEvidence = rows[2].querySelector<StatusPill>('pb-status-pill')!;
  await noEvidence.updateComplete;
  expect(noEvidence.shadowRoot?.querySelector('[aria-hidden="true"]')?.textContent).toBe('–');
  expect(rows[2].querySelector('pb-rule-set-chip')).toBeNull();

  const deepLink = rows.find(row => row.querySelector('a')?.textContent === repository)!
    .querySelector<HTMLAnchorElement>('a')!;
  const latest = deepLink.closest('.release')!;
  expect(latest.querySelector('dd')?.textContent).toBe('2.0');
  expect([...latest.querySelectorAll<RuleSetChip>('pb-rule-set-chip')].map(chip => chip.label))
    .toEqual(['Repository baseline', expect.stringContaining('Security and release readiness')]);
  const recorded = latest.querySelector<RelativeTime>('pb-relative-time')!;
  await recorded.updateComplete;
  const tooltip = recorded.shadowRoot?.querySelector<Tooltip>('pb-tooltip')!;
  expect(tooltip.description).toContain('2026');
  expect(recorded.shadowRoot?.querySelector('time')?.getAttribute('datetime')).toBe(recorded.value);

  const markup = rows.find(row => row.textContent?.includes('release-<'))!;
  expect(markup.querySelector('dd')?.textContent?.length).toBeGreaterThan(200);
  expect(markup.querySelector('img')).toBeNull();
  const chip = markup.querySelector<RuleSetChip>('pb-rule-set-chip')!;
  await chip.updateComplete;
  expect(chip.shadowRoot?.querySelector('a')?.textContent).toContain('<img');
  expect(chip.shadowRoot?.querySelector('img')).toBeNull();

  const paths = fetch.mock.calls.map(([path]) => new URL(path, window.location.origin));
  expect(paths.map(path => path.pathname)).toEqual(['/v0/releases/latest', '/v0/releases/latest']);
  const cursor = JSON.parse(paths[1].searchParams.get('before')!);
  expect(cursor).toMatchObject({ repository: expect.stringContaining('project-'), version: '1.0' });

  deepLink.click();
  await app.updateComplete;
  const history = await loaded(app);
  expect(window.location.pathname + window.location.search).toBe(repositoryReleasesPath(repository));
  expect(history.shadowRoot?.activeElement?.textContent).toBe(repository);
});

test('opens repository release history directly and keeps receipts in ledger order', async () => {
  const fetch = mockPreview();
  const app = await open(repositoryReleasesPath(repository));
  const { shadowRoot: root } = await loaded(app);
  expect(root!.querySelector('h1:not(.assistive)')?.textContent).toBe(repository);
  expect([...root!.querySelectorAll('h2')].map(el => el.textContent)).toEqual(['2.0', '1.11', '1.9']);
  expect([...root!.querySelectorAll<StatusPill>('pb-status-pill')].map(pill => pill.status))
    .toEqual(['PASS', 'ERROR', 'PASS']);
  const firstCommit = root!.querySelector<Tooltip>('.release pb-tooltip')!;
  await firstCommit.updateComplete;
  expect(firstCommit.description).toMatch(/^[0-9a-f]{40}$/);
  expect(firstCommit.querySelector('code')?.textContent).toBe(firstCommit.description.slice(0, 7));
  const descriptionId = firstCommit.shadowRoot?.querySelector('button')?.getAttribute('aria-describedby');
  expect(firstCommit.shadowRoot?.getElementById(descriptionId!)?.textContent?.trim()).toBe(firstCommit.description);
  expect(root!.querySelector('a[href="/releases"]')).not.toBeNull();
  expect(new URL(fetch.mock.calls[0][0], window.location.origin).searchParams.get('repository')).toBe(repository);
});

test.each([
  ['/releases', 'No release has been recorded yet.'],
  [repositoryReleasesPath('github.com/acme/unreleased'), 'No release has been recorded for this repository.'],
])('explains an empty release page at %s', async (path, message) => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
  const app = await open(path);
  const root = app.shadowRoot!.querySelector('pb-releases')!.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelector('pb-empty-state')).not.toBeNull());
  expect(root.querySelector('pb-empty-state')).toHaveProperty('message', message);
  expect(root.querySelector('.release')).toBeNull();
});

test('round-trips a repository address containing URL delimiters', () => {
  const repository = 'host/org/repo +?&/#%<b>✓';
  expect(routeFor(repositoryReleasesPath(repository))).toEqual({ view: 'repository-releases', repository });
});
