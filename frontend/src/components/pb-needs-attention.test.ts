import { afterEach, expect, test } from 'vitest';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import type { RepositoryOverview, RepositoryOverviewEntry } from '../api/client';
import { repositoryPath } from '../views/router';
import type { CommitLink } from './pb-commit-link';
import { NeedsAttention } from './pb-needs-attention';
import type { RelativeTime } from './pb-relative-time';
import type { Widget } from './pb-widget';

const { repositoryOverview } = fixtureTargets;
const { repositories } = respond(repositoryOverview + '?preview=needs-attention')!.body as RepositoryOverview;
const fixture = (name: string) => repositories.find(entry => entry.repository.endsWith(`/${name}`))!;
const failedCheck = repositories.find(entry => entry.latest_check?.overall === 'FAIL')!;
const longName = repositories.find(entry => entry.repository.endsWith('-unknown'))!;

async function mount(entries: readonly RepositoryOverviewEntry[] = [...repositories].reverse()) {
  const widget = new NeedsAttention();
  widget.repositories = entries;
  document.body.append(widget);
  await widget.updateComplete;
  return widget.shadowRoot!;
}

const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, ' ').trim();

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0015, REQ-0017 and REQ-0019.
test('lists every non-passed repository by severity then name with linked names and health labels', async () => {
  const root = await mount();
  const frame = root.querySelector<Widget>('pb-widget')!;
  await frame.updateComplete;
  expect(frame.shadowRoot!.querySelector('h2')?.textContent).toBe('Needs attention');
  const rows = [...root.querySelectorAll('li')];
  const expected = [
    [fixture('gadget'), 'Error', 'error'],
    [fixture('no-records'), 'Fail', 'cross'],
    [fixture('overdue-final'), 'Fail', 'cross'],
    [failedCheck, 'Fail', 'cross'],
    [fixture('widget'), 'Warn', 'warning'],
    [longName, 'Not run', 'circle'],
    [fixture('never-synced'), 'Not run', 'circle'],
    [fixture('stale-sync'), 'Not run', 'circle'],
    [fixture('elsewhere'), 'Not run', 'circle'],
  ] as const;
  expect(rows).toHaveLength(expected.length);
  expected.forEach(([{ repository }, label, icon], index) => {
    const row = rows[index];
    const link = row.querySelector('.repository-name')!;
    expect(link.getAttribute('href')).toBe(repositoryPath(repository));
    expect(link.getAttribute('aria-label')).toBe(repository);
    expect(link.textContent).toBe(repository.split('/').at(-1));
    expect(text(row.querySelector('.repository-prefix'))).toBe(repository.split('/').at(-2) + '/');
    const outcome = row.querySelector('pb-status-pill')?.shadowRoot;
    expect(text(outcome?.querySelector('.pill span') ?? null)).toBe(label);
    expect(outcome?.querySelector('pb-icon')?.getAttribute('name')).toBe(icon);
  });
});

test.each([[failedCheck, 'FAIL'], [fixture('gadget'), 'ERROR']] as const)(
  'shows the reported verdict, commit and receipt time for %s',
  async (entry, verdict) => {
    const root = await mount([entry]);
    const reason = root.querySelector('.reason')!;
    expect(root.querySelector('.title pb-status-pill')).toHaveProperty('status', verdict);
    expect(reason.querySelector('pb-status-pill')).toBeNull();
    expect(text(reason)).toBe('· Reported');
    const commit = reason.querySelector<CommitLink>('pb-commit-link')!;
    const time = reason.querySelector<RelativeTime>('pb-relative-time')!;
    await Promise.all([commit.updateComplete, time.updateComplete]);
    expect(commit.repository).toBe(entry.repository);
    expect(commit.commit).toBe(entry.latest_check!.commit);
    expect(commit.shadowRoot!.querySelector('code')?.textContent).toBe(entry.latest_check!.commit.slice(0, 7));
    expect(time.shadowRoot!.querySelector('time')?.getAttribute('datetime')).toBe(entry.latest_check!.received_at);
  },
);

test.each([
  [fixture('no-records'), 'Never integrated'],
  [fixture('widget'), 'Overdue (step 1 of 4)'],
  [fixture('overdue-final'), 'Overdue (step 4 of 4)'],
  [fixture('stale-sync'), 'Evidence status unknown'],
] as const)('shows the evidence reason for %s', async (entry, expected) => {
  const root = await mount([entry]);
  expect(text(root.querySelector('.reason'))).toBe(expected);
});

test('uses failing evidence before the overdue reason, and unknown health before a stale verdict', async () => {
  const overdue = { ...fixture('widget'), latest_check: failedCheck.latest_check };
  const unknown = { ...fixture('stale-sync'), latest_check: failedCheck.latest_check };
  const root = await mount([unknown, overdue]);
  const [failure, missing] = root.querySelectorAll('.reason');
  expect(failure.parentElement?.querySelector('.title pb-status-pill')).toHaveProperty('status', 'FAIL');
  expect(failure.querySelector('pb-commit-link')).not.toBeNull();
  expect(text(missing)).toBe('Evidence status unknown');
});

test.each([
  [[], '0 repositories'],
  [[fixture('pending')], '1 repository'],
  [(respond(repositoryOverview + '?preview=needs-attention-clear')!.body as RepositoryOverview).repositories, '3 repositories'],
] as const)('shows an all-clear count for the supplied overview', async (entries, count) => {
  const root = await mount(entries);
  expect(root.querySelector('ul')).toBeNull();
  expect(text(root.querySelector('p'))).toBe(`No repositories need attention. ${count} checked.`);
});

// Verifies REQ-0004.
test('renders markup in the organization and repository name as text', async () => {
  const entry = { ...longName, repository: 'github.com/<img src=owner>/<img src=x>' };
  const root = await mount([entry]);
  expect(root.querySelector('.repository-name')?.textContent).toBe('<img src=x>');
  expect(root.querySelector('.repository-prefix')?.textContent).toBe('<img src=owner>/');
  expect(root.querySelector('img')).toBeNull();
});
