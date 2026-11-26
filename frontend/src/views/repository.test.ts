// Verifies REQ-0030 and REQ-0033.
import { afterEach, expect, test, vi } from 'vitest';
import { respond } from '../../../tools/preview/fixtures.mjs';
import type { Summary } from '../api/client';
import { CockpitApp } from '../components/app';
import type { DataTable } from '../components/pb-data-table';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { releasePath, repositoryPath, routeFor } from './router';

const repository = 'github.com/acme/return-navigation';

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

async function open(path: string) {
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
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('.releases, pb-empty-state')).not.toBeNull());
  return { root: view.shadowRoot!, fetch };
}

test.each([repositoryPath(repository), '/releases/repository?repository=github.com%2Facme%2Freturn-navigation'])(
  'opens %s directly with release history and repository attestations',
  async path => {
    const { root, fetch } = await open(path);
    expect(root.querySelector('h1')?.textContent).toBe('return-navigation');
    expect(root.querySelector('.canonical')?.textContent).toBe(repository);
    expect([...root.querySelectorAll('section > h2')].map(heading => heading.textContent))
      .toEqual(['Releases', 'Attestations']);
    const versions = [...root.querySelectorAll('.release > a')];
    expect(versions.map(link => link.textContent)).toEqual(['2.0', '1.11', '1.9']);
    expect(versions[0].getAttribute('href')).toBe(releasePath(repository, '2.0'));
    expect([...root.querySelectorAll<StatusPill>('.release pb-status-pill')].map(pill => pill.status))
      .toEqual(['PASS', 'ERROR', 'PASS']);
    const commit = root.querySelector<Tooltip>('.release pb-tooltip')!;
    await commit.updateComplete;
    expect(commit.description).toMatch(/^[0-9a-f]{40}$/);
    expect(commit.querySelector('code')?.textContent).toBe(commit.description.slice(0, 7));
    const descriptionId = commit.shadowRoot?.querySelector('button')?.getAttribute('aria-describedby');
    expect(commit.shadowRoot?.getElementById(descriptionId!)?.textContent?.trim()).toBe(commit.description);
    expect(root.querySelector('a[href="/releases"]')).not.toBeNull();

    const [latest, history] = [...root.querySelectorAll<DataTable>('pb-data-table')];
    expect(latest.label).toBe('Latest by execution point');
    expect(latest.rows.map(row => row.cells[0])).toEqual(['check']);
    expect(history.label).toBe('Recent attestations');
    const filteredHistory = '/v0/attestations?limit=100&repository=github.com%2Facme%2Freturn-navigation';
    const expected = respond(filteredHistory)!.body as Summary[];
    expect(history.rows.map(row => row.key)).toEqual(expected.map(summary => summary.id));
    expect(history.shadowRoot?.querySelector('tbody a')?.getAttribute('href')).toBe(`/attestations/${expected[0].id}`);
    expect(fetch.mock.calls.map(([target]) => target)).toEqual([
      '/v0/releases?limit=100&repository=github.com%2Facme%2Freturn-navigation',
      '/v0/attestations/latest',
      filteredHistory,
    ]);
  },
);

test('selects each execution point independently from overlapping combinations', async () => {
  const { root } = await open(repositoryPath('github.com/acme/widget'));
  const latest = root.querySelector<DataTable>('pb-data-table')!;
  const links = [...latest.shadowRoot!.querySelectorAll('tbody tr')].map(row =>
    [row.querySelector('th')?.textContent, row.querySelector('a')?.getAttribute('href')]);
  expect(links).toEqual([
    ['deploy', '/attestations/00000000-0000-4000-8000-000000000082'],
    ['build', '/attestations/00000000-0000-4000-8000-000000000081'],
    ['release', '/attestations/00000000-0000-4000-8000-000000000080'],
  ]);
  expect(root.querySelector('pb-empty-state')).toHaveProperty('heading', 'No releases');
});

test('shows the latest attestation without execution points', async () => {
  const { root } = await open(repositoryPath('github.com/acme/gadget'));
  expect(root.querySelector<DataTable>('pb-data-table')!.rows[0].cells[0]).toBe('No execution points');
});

test.each([
  ['github.com/acme/missing-evidence', ['No attestations']],
  ['github.com/acme/no-records', ['No releases', 'No attestations']],
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
  const repository = 'host/org/repo +?&/#%<b>✓';
  expect(routeFor(repositoryPath(repository))).toEqual({ view: 'repository', repository });
  expect(routeFor('/repositories/detail?repository=x&repository=y').view).toBe('not-found');
  expect(routeFor('/repositories/detail?repository=').view).toBe('not-found');
});
