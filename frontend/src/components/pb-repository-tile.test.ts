import { afterEach, expect, test, vi } from 'vitest';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import type { RepositoryOverview, RepositoryOverviewEntry } from '../api/client';
import { releasePath, repositoryPath, Router } from '../views/router';
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
test('shows the overdue state and a separate check verdict', async () => {
  const root = await mount(report);
  expect(root.querySelector('.tile')?.classList).toContain('warning');
  expect(root.querySelector<StatusPill>('.title > pb-status-pill')?.status).toBe('PASS');
  expect(root.textContent).toContain('Overdue (step 1 of 4)');
  expect(root.querySelectorAll('pb-commit-link')).toHaveLength(2);
});

test('shows no evidence when a repository has never integrated', async () => {
  const root = await mount(fixture('no-records'));
  expect(root.querySelector<StatusPill>('.title > pb-status-pill')?.status).toBe('No evidence');
  expect(root.querySelector('pb-commit-link')).toBeNull();
});

test('identifies an unmanaged repository', async () => {
  const root = await mount(fixture('elsewhere'));
  expect(root.textContent).toContain('Unknown · Not managed');
});

test('shows the owner, shortened name and exact reported time without the old tile rows', async () => {
  const check = report.latest_check!;
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(Date.parse(check.received_at) + 300_000) });
  const root = await mount(report);
  const owner = root.querySelector('.owner')!;
  expect(owner.textContent).toBe('acme');
  const repository = root.querySelector<HTMLAnchorElement>('a.repository')!;
  const nameTooltip = repository.parentElement as Tooltip;
  expect(owner.parentElement!.nextElementSibling).toBe(root.querySelector('.title'));
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

// Verifies REQ-0019.
test.each([
  { name: 'both facts', entry: fixture('return-navigation'), version: '2.0', target: 'production' },
  { name: 'deployment only', entry: fixture('pending'), version: null, target: 'staging' },
  { name: 'release only', entry: fixture('gadget'), version: '1.0', target: null },
  { name: 'neither fact', entry: fixture('no-records'), version: null, target: null },
])('shows the applicable summary for $name', async ({ entry, version, target }) => {
  const deployment = entry.latest_deployment;
  if (deployment) {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse(deployment.received_at) + 300_000 });
  }
  const root = await mount(entry);
  const facts = root.querySelector('.facts');
  expect(root.querySelector('.tile')!.children.length).toBeLessThanOrEqual(5);
  if (!version && !target) {
    expect(facts).toBeNull();
    return;
  }
  const link = facts!.querySelector('a');
  if (version) {
    expect(link?.textContent).toBe(version);
    expect(link?.getAttribute('href')).toBe(releasePath(entry.repository, version));
    expect(link?.hasAttribute('data-route')).toBe(true);
  } else {
    expect(link).toBeNull();
  }
  const time = facts!.querySelector<RelativeTime>('pb-relative-time');
  if (target) {
    expect(facts!.textContent).toContain(`${target},`);
    expect(link?.textContent).not.toBe(target);
    await time!.updateComplete;
    expect(time!.shadowRoot!.querySelector('time')?.textContent).toBe('5 minutes ago');
    expect(time!.shadowRoot!.querySelector('time')?.dateTime).toBe(deployment!.received_at);
  } else {
    expect(time).toBeNull();
  }
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
