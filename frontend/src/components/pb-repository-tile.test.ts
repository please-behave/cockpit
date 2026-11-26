import { afterEach, expect, test, vi } from 'vitest';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import type { RepositoryOverview, RepositoryOverviewEntry } from '../api/client';
import { repositoryPath, Router } from '../views/router';
import type { CommitLink } from './pb-commit-link';
import type { RelativeTime } from './pb-relative-time';
import { RepositoryTile } from './pb-repository-tile';
import type { ShortName } from './pb-short-name';
import type { StatusPill } from './pb-status-pill';
import { formatTime } from './pb-time';
import type { Tooltip } from './pb-tooltip';

const fixtures = respond(fixtureTargets.repositoryOverview)!.body as RepositoryOverview;
const fixture = (name: string) => fixtures.repositories.find(entry => entry.repository.endsWith(`/${name}`))!;
const report = fixture('widget');

async function mount(entry: RepositoryOverviewEntry, parent = document.body) {
  const tile = new RepositoryTile();
  tile.entry = entry;
  parent.append(tile);
  await tile.updateComplete;
  return tile.shadowRoot!;
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Verifies REQ-0015 and REQ-0019.
test.each([
  ['return-navigation', 'passed', 'PASS', 'Current'],
  ['pending', 'passed', 'PASS', 'Pending'],
  ['widget', 'warning', 'PASS', 'Overdue (step 1 of 4)'],
  ['overdue-final', 'failed', 'PASS', 'Overdue (step 4 of 4)'],
  ['no-records', 'failed', 'No evidence', 'Never integrated'],
  ['never-synced', 'not-run', 'No evidence', 'Unknown'],
  ['stale-sync', 'not-run', 'PASS', 'Unknown'],
  ['elsewhere', 'not-run', 'PASS', 'Not managed'],
  ['gadget', 'failed', 'ERROR', 'Current'],
])('shows health, verdict and state for %s', async (name, health, verdict, state) => {
  const root = await mount(fixture(name));
  expect(root.querySelector('.tile')!.classList.contains(health)).toBe(true);
  expect(root.querySelector<StatusPill>('.title > pb-status-pill')!.status).toBe(verdict);
  expect(root.textContent).toContain(state);
  expect(root.querySelectorAll('pb-commit-link')).toHaveLength(
    verdict === 'No evidence' ? 0 : state.startsWith('Overdue') || state === 'Pending' ? 2 : 1,
  );
});

test('shows a FAIL verdict and failed health when evidence is current', async () => {
  const failed = fixtures.repositories.find(entry => entry.latest_check?.overall === 'FAIL')!;
  const root = await mount(failed);
  expect(root.querySelector<StatusPill>('pb-status-pill')?.status).toBe('FAIL');
  expect(root.querySelector('.tile')?.classList).toContain('failed');
});

test('shows the owner, shortened name and exact reported time without the old tile rows', async () => {
  const check = report.latest_check!;
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(Date.parse(check.received_at) + 300_000) });
  const root = await mount(report);
  const owner = root.querySelector('.owner')!;
  expect(owner.textContent).toBe('acme');
  const repository = root.querySelector<HTMLAnchorElement>('a.repository')!;
  const nameTooltip = repository.parentElement as Tooltip;
  expect(owner.nextElementSibling).toBe(root.querySelector('.title'));
  expect(nameTooltip.description).toBe(report.repository);
  expect(nameTooltip.hint).toBe(false);
  const name = repository.querySelector<ShortName>('pb-short-name')!;
  expect(name.value).toBe(report.repository);
  await name.updateComplete;
  expect(name.shadowRoot!.querySelector('.short')!.textContent).toBe('widget');
  expect(root.textContent).not.toMatch(/View repository|deploy|execution points|\brules?\b/);
  expect(root.querySelectorAll('a[data-route]')).toHaveLength(1);

  const relative = root.querySelector<RelativeTime>('pb-relative-time')!;
  await relative.updateComplete;
  const time = relative.shadowRoot!.querySelector('time')!;
  expect(time.textContent).toBe('5 minutes ago');
  expect(time.dateTime).toBe(check.received_at);
  expect(relative.shadowRoot!.querySelector<Tooltip>('pb-tooltip')?.description)
    .toBe(formatTime(new Date(check.received_at)));
});

test.each([
  ['pending', 'status-allowed', '1 observed head since evidence', '10 minutes'],
  ['widget', 'status-warning', '2 observed heads since evidence', '2 hours'],
  ['overdue-final', 'status-warning', '2 observed heads since evidence', '8 days'],
])('shows the state token, sampled heads and time awaiting evidence for %s', async (name, token, count, elapsed) => {
  const entry = fixture(name);
  const now = Date.parse(entry.pending_since!) + entry.pending_age_seconds! * 1000;
  vi.useFakeTimers({ toFake: ['Date'], now });
  const root = await mount(entry);
  const line = root.querySelector(`.${token}`)!;
  expect(line.textContent).toContain(count);
  expect(line.querySelector<CommitLink>('pb-commit-link')?.commit).toBe(entry.head!.commit);
  const duration = line.querySelector<RelativeTime>('pb-relative-time')!;
  await duration.updateComplete;
  expect(duration.shadowRoot!.querySelector('time')?.textContent).toBe(elapsed);
});

test('routes the repository name through shadow DOM and leaves the commit link independent', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = await mount(report, host);
  const repository = root.querySelector<HTMLAnchorElement>('a.repository')!;
  const component = root.querySelector<CommitLink>('pb-commit-link')!;
  await component.updateComplete;
  const commit = component.shadowRoot!.querySelector('a')!;
  const path = '/repositories/detail?repository=github.com%2Facme%2Fwidget';
  expect(repository.getAttribute('href')).toBe(path);
  expect(repository.hasAttribute('data-route')).toBe(true);
  expect(commit.getAttribute('href')).toBe(`https://github.com/acme/widget/commit/${report.latest_check!.commit}`);
  expect(commit.target).toBe('_blank');
  expect(commit.rel).toBe('noopener noreferrer');
  expect(commit.querySelector('code')!.textContent).toBe(report.latest_check!.commit.slice(0, 7));

  const navigate = vi.fn();
  const router = new Router(host, navigate);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  router.connect();
  try {
    navigate.mockClear();
    const commitClick = vi.fn((event: MouseEvent) => {
      expect(event.defaultPrevented).toBe(false);
      event.preventDefault();
    });
    host.addEventListener('click', commitClick, { once: true });
    commit.querySelector('code')!.click();
    expect(commitClick).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    const name = repository.querySelector<ShortName>('pb-short-name')!;
    await name.updateComplete;
    name.shadowRoot!.querySelector<HTMLElement>('.short')!.click();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(path, undefined, false);
    expect(window.location.pathname + window.location.search).toBe(path);
  } finally {
    router.disconnect();
  }
});

test.each(['gitlab.com/acme/widget', 'github.com/acme/widget/<script>'])(
  'shows a plain commit for %s',
  async repository => {
    const root = await mount({ ...report, repository });
    const commit = root.querySelector<CommitLink>('pb-commit-link')!;
    await commit.updateComplete;
    expect(commit.shadowRoot!.querySelector('a')).toBeNull();
    expect(commit.shadowRoot!.querySelector('code')!.textContent).toBe(report.latest_check!.commit.slice(0, 7));
  },
);

// Verifies REQ-0004.
test('renders repository markup as text and encodes its canonical name', async () => {
  const markup = '<b data-markup>';
  const repository = `github.com/${markup}/${markup}`;
  const root = await mount({ ...report, repository });
  const link = root.querySelector('a.repository')!;
  const name = link.querySelector<ShortName>('pb-short-name')!;
  await name.updateComplete;
  expect(link.getAttribute('href')).toBe(repositoryPath(repository));
  expect(root.querySelector('.owner')!.textContent).toBe(markup);
  expect(name.shadowRoot!.querySelector('.short')!.textContent).toBe(markup);
  expect(root.querySelector('b, img')).toBeNull();
});
