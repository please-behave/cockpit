// Verifies REQ-0030 and REQ-0033.
import { afterEach, expect, test, vi } from 'vitest';
import { respond } from '../../../tools/preview/fixtures.mjs';
import type { Deployment, RepositoryRuleSets, Summary } from '../api/client';
import { CockpitApp } from '../components/app';
import type { DataTable } from '../components/pb-data-table';
import type { RelativeTime } from '../components/pb-relative-time';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { RuleSetSummary } from '../components/pb-rule-set-summary';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { releasePath, repositoryPath, routeFor, ruleSetPath } from './router';

const repository = 'github.com/acme/return-navigation';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function open(path: string) {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const fetch = vi.fn(async (target: string) => {
    const fixture = respond(target)!;
    return Response.json(fixture.body, { status: fixture.status });
  });
  vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', path);
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector('pb-repository')!;
  await vi.waitFor(() =>
    expect(view.shadowRoot!.querySelector('[aria-labelledby="releases"] :is(pb-data-table, pb-empty-state)')).not.toBeNull());
  return { app, root: view.shadowRoot!, fetch };
}

test.each([repositoryPath(repository), '/releases/repository?repository=github.com%2Facme%2Freturn-navigation'])(
  'opens %s directly with release history and repository attestations',
  async path => {
    const { root, fetch } = await open(path);
    expect(root.querySelector('h1')?.textContent).toBe('return-navigation');
    expect(root.querySelector('.canonical')?.textContent).toBe(repository);
    expect([...root.querySelectorAll('section > h2')].map(heading => heading.textContent))
      .toEqual(['Completed Rule Sets', 'Releases', 'Deployments', 'Attestations']);
    const table = root.querySelector<DataTable>('[aria-labelledby="releases"] pb-data-table')!;
    await table.updateComplete;
    expect(table.label).toBe('Release history');
    expect(table.shadowRoot?.querySelector('thead button, [aria-sort]')).toBeNull();
    const rows = [...table.shadowRoot!.querySelectorAll('tbody tr')];
    const versions = rows.map(row => row.querySelector('th a')!);
    expect(versions.map(link => link.textContent)).toEqual(['2.0', '1.11', '1.9', '1.8']);
    expect(versions[0].getAttribute('href')).toBe(releasePath(repository, '2.0'));
    expect(rows.map(row => row.querySelector<StatusPill>('pb-status-pill')!.status))
      .toEqual(['PASS', 'ERROR', 'PASS', 'No evidence']);
    expect(rows.map(row => row.querySelector<RuleSetSummary>('pb-rule-set-summary')!.sets.length))
      .toEqual([2, 0, 0, 0]);
    const commit = rows[0].querySelector<Tooltip>('td pb-tooltip')!;
    await commit.updateComplete;
    expect(commit.description).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.querySelector('code')?.textContent).toBe(commit.description.slice(0, 7));
    const descriptionId = commit.shadowRoot?.querySelector('[aria-describedby]')?.getAttribute('aria-describedby');
    expect(commit.shadowRoot?.getElementById(descriptionId!)?.textContent?.trim()).toBe(commit.description);
    expect(root.querySelector('a[href="/releases"]')).not.toBeNull();

    const [latest, history] = root.querySelectorAll<DataTable>('[aria-labelledby="attestations"] pb-data-table');
    expect(latest.label).toBe('Latest by execution-point combination');
    expect(latest.rows.map(row => row.cells[0])).toEqual(['check']);
    expect(history.label).toBe('Recent attestations');
    expect(history.shadowRoot?.querySelector('thead button, [aria-sort]')).toBeNull();
    const filteredHistory = '/v0/attestations?limit=100&repository=github.com%2Facme%2Freturn-navigation';
    const expected = respond(filteredHistory)!.body as Summary[];
    expect(history.rows.map(row => row.key)).toEqual(expected.map(summary => summary.id));
    expect(history.shadowRoot?.querySelector('tbody pb-relative-time')?.shadowRoot?.querySelector('a')?.getAttribute('href'))
      .toBe(`/attestations/${expected[0].id}`);
    expect(fetch.mock.calls.map(([target]) => target)).toEqual([
      '/v0/releases?limit=100&repository=github.com%2Facme%2Freturn-navigation',
      '/v0/attestations/latest',
      filteredHistory,
      '/v0/deployments?limit=100&repository=github.com%2Facme%2Freturn-navigation',
      '/v0/repositories/completed-rule-sets',
      '/v0/deployments?limit=100&repository=github.com%2Facme%2Freturn-navigation&before=9',
    ]);
  },
);

test('lists only this repository’s completed sets with links to their bound versions', async () => {
  const { root } = await open(repositoryPath(repository));
  const chips = [...root.querySelectorAll<RuleSetChip>('[aria-labelledby="completed-rule-sets"] pb-rule-set-chip')];
  const completed = respond('/v0/repositories/completed-rule-sets')!.body as RepositoryRuleSets[];
  const sets = completed.find(entry => entry.repository === repository)!.sets;
  expect(chips).toHaveLength(3);
  expect(chips.map(chip => [chip.label, chip.href]))
    .toEqual(sets.map(set => [`${set.name} · ${set.version}`, ruleSetPath(set, set.version)]));
});

test('shows each current target with its release or commit and reported evidence', async () => {
  const { app, root } = await open(repositoryPath(repository));
  const section = root.querySelector('section[aria-labelledby="deployments"]')!;
  const table = section.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  const rows = [...table.shadowRoot!.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  expect(rows).toHaveLength(108);
  const headings = rows.map(row => row.cells[0].textContent?.trim());
  expect(new Set(headings).size).toBe(rows.length);
  expect(headings).toContain('github.com/acme/infrastructure · production');
  expect(headings).toContain('github.com/acme/other-infrastructure · production');
  expect(headings).toContain('github.com/acme/infrastructure · test-102');
  expect(headings.some(heading => heading!.length > 100)).toBe(true);
  expect(new Set(rows.map(list => list.querySelector<StatusPill>('pb-status-pill')?.status)))
    .toEqual(new Set(['ERROR', 'release not recorded', 'No evidence', 'PASS']));
  expect(headings[0]).toBe('github.com/acme/infrastructure · rollback');

  const missingRelease = rows[1];
  expect(missingRelease.cells[1].textContent?.trim()).toMatch(/^unrecorded-<img/);
  expect(missingRelease.cells[1].querySelector('a, img')).toBeNull();
  expect(missingRelease.querySelector('pb-rule-set-summary')).toHaveProperty('sets', []);
  const missingEvidence = rows[2];
  const commit = missingEvidence.cells[1].querySelector<Tooltip>('pb-tooltip')!;
  expect(commit.description).toBe('9'.repeat(40));
  expect(commit.querySelector('code')?.textContent).toBe('9999999');
  expect(missingEvidence.querySelector('pb-rule-set-summary')).toHaveProperty('sets', []);

  const production = rows[headings.indexOf('github.com/acme/infrastructure · production')];
  const version = production.querySelector('a')!;
  expect(version.textContent).toBe('2.0');
  expect(version.getAttribute('href')).toBe(releasePath(repository, '2.0'));
  const time = production.querySelector<RelativeTime>('pb-relative-time')!;
  expect(time.shadowRoot?.querySelector('time')?.dateTime).toBe(time.value);
  const summary = production.querySelector<RuleSetSummary>('pb-rule-set-summary')!;
  const entries = respond('/v0/deployments')!.body as Deployment[];
  expect(summary.sets).toEqual(entries[0].evidence!.completed_rule_sets);
  version.click();
  await app.updateComplete;
  expect(app.shadowRoot!.querySelector('pb-release')).not.toBeNull();
});

test('links an empty Deployments section to the Deployments tab', async () => {
  const { app, root } = await open(repositoryPath('github.com/acme/widget'));
  const section = root.querySelector('section[aria-labelledby="deployments"]')!;
  expect(section.querySelector('pb-empty-state')?.getAttribute('heading')).toBe('No deployments');
  const link = section.querySelector('a')!;
  expect(link.getAttribute('href')).toBe('/deployments');
  link.click();
  await app.updateComplete;
  expect(app.shadowRoot!.querySelector('pb-deployments')).not.toBeNull();
});

test('shows every overlapping execution-point combination separately', async () => {
  const { root } = await open(repositoryPath('github.com/acme/widget'));
  const latest = root.querySelector<DataTable>('pb-data-table')!;
  const links = [...latest.shadowRoot!.querySelectorAll('tbody tr')].map(row =>
    [row.querySelector('th')?.textContent, row.querySelector('pb-relative-time')?.shadowRoot?.querySelector('a')?.getAttribute('href')]);
  expect(links).toEqual([
    ['deploy', '/attestations/00000000-0000-4000-8000-000000000082'],
    ['build', '/attestations/00000000-0000-4000-8000-000000000081'],
    ['release, deploy', '/attestations/00000000-0000-4000-8000-000000000080'],
  ]);
  const executionPoints = latest.shadowRoot!.querySelector<HTMLButtonElement>('thead button')!;
  executionPoints.click();
  await latest.updateComplete;
  expect(executionPoints.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
  expect([...latest.shadowRoot!.querySelectorAll('tbody th')].map(cell => cell.textContent))
    .toEqual(['build', 'deploy', 'release, deploy']);
  expect(root.querySelector('pb-empty-state')).toHaveProperty('heading', 'No releases');
});

test('shows the latest attestation without execution points', async () => {
  const { root } = await open(repositoryPath('github.com/acme/gadget'));
  expect(root.querySelector<DataTable>('[aria-labelledby="attestations"] pb-data-table')!.rows[0].cells[0])
    .toBe('No execution points');
});

test.each([
  ['github.com/acme/missing-evidence', ['No attestations']],
  ['github.com/acme/no-records', ['No releases', 'No deployments', 'No attestations']],
])('shows the applicable empty states for %s', async (name, emptySections) => {
  const { root } = await open(repositoryPath(name));
  expect([...root.querySelectorAll('pb-empty-state')].map(panel => panel.getAttribute('heading')))
    .toEqual(emptySections);
});

test('shows long and markup-like repository names as text', async () => {
  const summaries = respond('/v0/attestations/latest')!.body as Summary[];
  const longName = summaries.find(summary => summary.repository.length > 120)!.repository;
  const markup = summaries.find(summary => summary.repository.includes('<img'))!.repository;
  for (const repository of [longName, markup]) {
    const { root } = await open(repositoryPath(repository));
    expect(root.querySelector('h1')?.textContent).toBe(repository.split('/').at(-1));
    expect(root.querySelector('.canonical')?.textContent).toBe(repository);
    expect(root.querySelector('img, b')).toBeNull();
    document.body.replaceChildren();
  }
});

test('round-trips the canonical name and rejects ambiguous addresses', () => {
  const repository = 'host/org/repo +?&/#%<b>é';
  expect(routeFor(repositoryPath(repository))).toEqual({ view: 'repository', repository });
  expect(routeFor('/repositories/detail?repository=x&repository=y').view).toBe('not-found');
  expect(routeFor('/repositories/detail?repository=').view).toBe('not-found');
});
