import { afterEach, expect, test, vi } from 'vitest';
import type { Summary } from '../api/client';
import { Router } from '../views/router';
import type { RelativeTime } from './pb-relative-time';
import { RepositoryTile } from './pb-repository-tile';
import type { ShortName } from './pb-short-name';
import type { StatusPill } from './pb-status-pill';
import { formatTime } from './pb-time';

const report: Summary = {
  id: 'first?query',
  overall: 'FAIL',
  repository: 'github.com/acme/widget',
  execution_points: ['deploy'],
  received_at: '2026-11-22T12:00:00Z',
  sender: 'sender',
  commit: '0123456789abcdef',
  warn_count: 1,
  not_run_count: 0,
  result_count: 1,
};

async function mount(summary: Summary, showExecutionPoints = false, parent = document.body) {
  const tile = new RepositoryTile();
  tile.summary = summary;
  tile.showExecutionPoints = showExecutionPoints;
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

// Verifies REQ-0019.
test('shows the status, owner, shortened name, execution points, reported time and rule count', async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-22T12:05:00Z') });
  const root = await mount(report, true);
  expect(root.querySelector('.tile')!.classList.contains('failed')).toBe(true);
  expect(root.querySelector<StatusPill>('pb-status-pill')!.status).toBe('FAIL');
  const owner = root.querySelector('.owner')!;
  expect(owner.textContent).toBe('acme');
  const repository = root.querySelector<HTMLAnchorElement>('a.repository')!;
  expect(owner.nextElementSibling).toBe(repository);
  const name = repository.querySelector<ShortName>('pb-short-name')!;
  expect(name.value).toBe(report.repository);
  await name.updateComplete;
  expect(name.shadowRoot!.querySelector('.short')!.textContent).toBe('widget');
  expect(root.textContent).toContain('deploy');
  expect(root.textContent).not.toMatch(/warning|not run/);
  expect(root.textContent).not.toContain('shown as reported');

  const relative = root.querySelector<RelativeTime>('pb-relative-time')!;
  await relative.updateComplete;
  expect(relative.parentElement!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Reported · 1 rule');
  const time = relative.shadowRoot!.querySelector('time')!;
  expect(time.textContent).toBe('5 minutes ago');
  expect(time.dateTime).toBe(report.received_at);
  expect(time.title).toBe(formatTime(new Date(report.received_at)));
});

test('hides execution points by default and labels an empty combination when shown', async () => {
  const root = await mount({ ...report, overall: 'PASS', warn_count: 2, not_run_count: 3, result_count: 7 });
  expect(root.querySelector('.tile')!.classList.contains('passed')).toBe(true);
  expect(root.textContent).not.toContain('deploy');
  expect(root.textContent).toContain('· 7 rules');
  expect(root.textContent).not.toMatch(/warning|not run/);

  const empty = await mount({ ...report, overall: 'ERROR', execution_points: [] }, true);
  expect(empty.querySelector('.tile')!.classList.contains('error')).toBe(true);
  expect(empty.textContent).toContain('no execution points');
});

test('routes the repository link through shadow DOM and leaves the commit link independent', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = await mount(report, false, host);
  const repository = root.querySelector<HTMLAnchorElement>('a.repository')!;
  const commit = root.querySelector<HTMLAnchorElement>('a.commit')!;
  expect(repository.getAttribute('href')).toBe('/attestations/first%3Fquery');
  expect(repository.hasAttribute('data-route')).toBe(true);
  expect(commit.getAttribute('href')).toBe('https://github.com/acme/widget/commit/0123456789abcdef');
  expect(commit.target).toBe('_blank');
  expect(commit.rel).toBe('noopener noreferrer');
  expect(commit.querySelector('code')!.textContent).toBe('0123456');
  expect(commit.textContent).toContain('(opens in a new tab)');

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
    expect(window.location.pathname).toBe('/');

    const name = repository.querySelector<ShortName>('pb-short-name')!;
    await name.updateComplete;
    name.shadowRoot!.querySelector<HTMLElement>('.short')!.click();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/attestations/first%3Fquery', 'dashboard', false);
    expect(window.location.pathname).toBe('/attestations/first%3Fquery');
  } finally {
    router.disconnect();
  }
});

test.each(['gitlab.com/acme/widget', 'github.com/acme/widget/<script>'])(
  'shows a plain commit for %s',
  async repository => {
    const root = await mount({ ...report, repository });
    expect(root.querySelector('a.commit')).toBeNull();
    expect(root.querySelector('code')!.textContent).toBe('0123456');
  },
);

// Verifies REQ-0004.
test('renders reported markup as text and encodes the attestation identifier', async () => {
  const markup = '<b data-markup>';
  const root = await mount({
    ...report, id: markup, repository: `github.com/${markup}/${markup}`,
    execution_points: [markup], commit: '<b>textabcdef',
  }, true);
  const link = root.querySelector('a.repository')!;
  const name = link.querySelector<ShortName>('pb-short-name')!;
  await name.updateComplete;
  expect(link.getAttribute('href')).toBe('/attestations/%3Cb%20data-markup%3E');
  expect(root.querySelector('.owner')!.textContent).toBe(markup);
  expect(name.shadowRoot!.querySelector('.short')!.textContent).toBe(markup);
  expect(root.textContent).toContain(markup);
  expect(root.querySelector('code')!.textContent).toBe('<b>text');
  expect(root.querySelector('a.commit, b')).toBeNull();
  expect(name.shadowRoot!.querySelector('b')).toBeNull();
});
