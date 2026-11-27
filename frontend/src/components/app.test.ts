import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  attestationPage, deployments, getAttestation, registeredRules, releases, repositoryOverview, type RepositoryOverview,
} from '../api/client';
import { fixtureTargets, respond } from '../../../tools/preview/fixtures.mjs';
import { CockpitApp } from './app';
import type { DetailView } from '../views/detail';
import type { DashboardView } from '../views/dashboard';
import type { HistoryView } from '../views/history';
import { CockpitAppShell } from './app-shell';
import type { NavTab } from './pb-nav-tab';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  repositoryOverview: vi.fn(async () => ({ heartbeat: { completed_at: null, stale: true }, repositories: [] })),
  completedRuleSets: vi.fn(async () => []),
  registeredRuleSets: vi.fn(async () => []),
  registeredRules: vi.fn(async () => []),
  releases: vi.fn(async () => []),
  deployments: vi.fn(async () => []),
  getAttestation: vi.fn(),
  attestationPage: vi.fn(async () => []),
}));

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Verifies REQ-0015.
test('pb-app renders its content in the application shell', async () => {
  const app = document.createElement('pb-app');
  expect(app).toBeInstanceOf(CockpitApp);
  document.body.append(app);
  await (app as CockpitApp).updateComplete;

  const dashboard = app.shadowRoot!.querySelector<DashboardView>('pb-dashboard')!;
  await dashboard.updateComplete;
  expect(dashboard.shadowRoot?.querySelector('h1')?.textContent).toBe('Dashboard');
  expect(dashboard.shadowRoot?.querySelector('h1')?.classList.contains('assistive')).toBe(true);
  const shell = app.shadowRoot?.querySelector('pb-app-shell') as CockpitAppShell;
  expect(shell).toBeInstanceOf(CockpitAppShell);
  await shell.updateComplete;

  const root = shell.shadowRoot!;
  expect(root.querySelector('header .logo-light')?.getAttribute('src')).toContain('logo.svg');
  expect(root.querySelector('header .logo-dark')?.getAttribute('src')).toContain('logo-dark.svg');
  const nav = root.querySelector('header nav[aria-label="Main"]')!;
  const tabs = [...nav.querySelectorAll<NavTab>('pb-nav-tab')];
  expect(tabs.map(tab => [tab.textContent?.trim(), tab.getAttribute('href')]))
    .toEqual([['Please Behave Dashboard', '/'], ['Attestations', '/attestations'], ['Releases', '/releases'], ['Deployments', '/deployments'], ['Rules', '/rules']]);
  expect(root.querySelector('header .actions pb-theme-toggle + a.sign-out')?.getAttribute('href')).toBe('/sign-out');
  expect(root.querySelector('main slot')).not.toBeNull();
  const footer = root.querySelector('main + footer[role="contentinfo"]')!;
  expect(footer.querySelector('span')?.textContent).toBe('© 2026 Please Behave');
  const project = footer.querySelector('a')!;
  expect(project.textContent).toBe('Please Behave');
  expect(project.getAttribute('href')).toBe('https://github.com/please-behave');
  expect(project.getAttribute('target')).toBe('_blank');
  expect([...project.relList]).toEqual(['noopener', 'noreferrer']);

  root.querySelector<HTMLAnchorElement>('.skip-link')!.click();
  expect(root.activeElement).toBe(root.querySelector('main'));
});

// Verifies REQ-0015.
test.each([false, true])('returns focus and scroll to the top with reduced motion %s', async reducedMotion => {
  const height = window.innerHeight;
  const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(height - 1);
  const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const matchMedia = vi.fn((query: string) => ({
    matches: reducedMotion && query === '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  const shell = new CockpitAppShell();
  document.body.append(shell);
  await shell.updateComplete;
  const root = shell.shadowRoot!;
  const button = () => root.querySelector<HTMLButtonElement>('.back-to-top');
  expect(button()).toBeNull();

  scrollY.mockReturnValue(height);
  window.dispatchEvent(new Event('scroll'));
  await shell.updateComplete;
  expect(button()?.textContent).toBe('Back to top');
  button()!.focus();
  button()!.click();
  expect(root.activeElement).toBe(root.querySelector('header'));
  expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });

  scrollY.mockReturnValue(0);
  window.dispatchEvent(new Event('scroll'));
  await shell.updateComplete;
  expect(button()).toBeNull();
});

// Verifies REQ-0015.
test('updates the header links for direct routes, link clicks, and history traversal', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.mocked(getAttestation).mockReturnValue(new Promise(() => {}));
  window.history.replaceState(null, '', '/attestations/example');
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const shell = app.shadowRoot!.querySelector<CockpitAppShell>('pb-app-shell')!;
  await shell.updateComplete;
  const tabs = [...shell.shadowRoot!.querySelectorAll<NavTab>('pb-nav-tab')];
  const links = tabs.map(tab => tab.shadowRoot!.querySelector('a')!);
  const current = () => links.filter(link => link.getAttribute('aria-current') === 'page');
  expect(current()).toEqual([links[1]]);

  links[2].click();
  await app.updateComplete;
  await shell.updateComplete;
  await tabs[2].updateComplete;
  expect(window.location.pathname).toBe('/releases');
  expect(current()).toEqual([links[2]]);

  for (const [path, expected] of [
    ['/releases/repository?repository=org%2Frepo', [links[2]]],
    ['/deployments', [links[3]]],
    ['/rules/detail', [links[4]]],
    ['/attestations', [links[1]]],
    ['/?status=failed', [links[0]]],
    ['/future/view', []],
  ] as const) {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await app.updateComplete;
    await shell.updateComplete;
    await Promise.all(tabs.map(tab => tab.updateComplete));
    expect(current()).toEqual(expected);
  }

  links[0].click();
  expect(window.location.pathname).toBe('/');
});

// Verifies REQ-0007.
test('mounts a deep link, disposes it on history navigation and focuses the next view', async () => {
  window.history.replaceState(null, '', '/attestations/example');
  vi.mocked(getAttestation).mockReturnValue(new Promise(() => {}));
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const detail = app.shadowRoot!.querySelector<DetailView>('pb-attestation')!;
  await detail.updateComplete;
  expect(getAttestation).toHaveBeenCalledWith('example', expect.any(AbortSignal));
  expect(detail.shadowRoot!.activeElement?.textContent).toBe('Attestation');
  expect(document.title).toBe('Attestation | Please Behave');

  window.history.pushState(null, '', '/future/view');
  window.dispatchEvent(new PopStateEvent('popstate'));
  await app.updateComplete;
  expect(vi.mocked(getAttestation).mock.calls.at(-1)?.[1].aborted).toBe(true);
  const missing = app.shadowRoot!.querySelector('pb-not-found')!;
  await vi.waitFor(() => {
    expect(missing.shadowRoot!.activeElement?.textContent).toBe('Page not found');
    expect(document.title).toBe('Page not found | Please Behave');
  });

  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  missing.shadowRoot!.querySelector('a')!.click();
  await app.updateComplete;
  const dashboard = app.shadowRoot!.querySelector<DashboardView>('pb-dashboard')!;
  await dashboard.updateComplete;
  expect(window.location.pathname).toBe('/');
  expect(repositoryOverview).toHaveBeenCalled();
  expect(dashboard.shadowRoot!.activeElement?.textContent).toBe('Dashboard');
});

// Verifies REQ-0021.
test('mounts the history at its route', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.history.replaceState(null, '', '/attestations');
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const history = app.shadowRoot!.querySelector<HistoryView>('pb-history')!;
  await history.updateComplete;
  expect(history.shadowRoot!.querySelector('h1')?.textContent).toBe('Attestations');
  expect(history.shadowRoot!.querySelector('h1')?.classList.contains('assistive')).toBe(true);
  expect(attestationPage).toHaveBeenCalledWith({ limit: 100 }, expect.any(AbortSignal));
});

// Verifies REQ-0022.
describe('history kept across detail navigation', () => {
  const summaries = (count: number) => Array.from({ length: count }, (_, index) => ({
    id: `id-${index}`,
    overall: 'PASS' as const,
    repository: 'github.com/acme/widget',
    execution_points: ['check'],
    received_at: '2026-11-22T11:18:19Z',
    sender: 'sender',
    commit: '0123456789abcdef',
    warn_count: 0,
    not_run_count: 0,
    result_count: 1,
  }));

  async function openHistory() {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.mocked(attestationPage).mockResolvedValue(summaries(100));
    vi.mocked(getAttestation).mockReturnValue(new Promise(() => {}));
    window.history.replaceState(null, '', '/attestations');
    const app = new CockpitApp();
    document.body.append(app);
    await app.updateComplete;
    const history = app.shadowRoot!.querySelector<HistoryView>('pb-history')!;
    await vi.waitFor(() => expect(history.shadowRoot!.querySelector('pb-data-table')).not.toBeNull());
    return { app, history };
  }

  const open = async (app: CockpitApp, url: string, origin?: 'history') => {
    window.history.pushState(origin ? { origin } : null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await app.updateComplete;
  };

  const goBack = async (app: CockpitApp) => {
    const popped = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.back();
    await popped;
    await app.updateComplete;
  };

  test('restores the loaded history at its scroll position without a request', async () => {
    const { app, history } = await openHistory();
    vi.mocked(attestationPage).mockClear();
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(4200);

    await open(app, '/attestations/id-3', 'history');
    expect(app.shadowRoot!.querySelector('pb-history')).toBeNull();
    await goBack(app);

    expect(app.shadowRoot!.querySelector('pb-history')).toBe(history);
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 4200);
    expect(attestationPage).not.toHaveBeenCalled();
    expect(history.shadowRoot!.querySelectorAll('pb-data-table')).toHaveLength(1);
  });

  test('aborts the requests of the kept history while it is detached', async () => {
    const { app, history } = await openHistory();
    const signals: AbortSignal[] = [];
    vi.mocked(attestationPage).mockImplementation((_, signal) => {
      signals.push(signal!);
      return new Promise(() => {});
    });
    (history as unknown as { loadMore(): Promise<void> }).loadMore();
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    await open(app, '/attestations/id-3', 'history');
    expect(signals[0].aborted).toBe(true);
  });

  test.each([
    ['the menu entry', '/attestations'],
    ['another view', '/'],
  ])('discards the kept history after %s', async (_, path) => {
    const { app, history } = await openHistory();
    await open(app, '/attestations/id-3', 'history');
    const shell = app.shadowRoot!.querySelector('pb-app-shell')!;
    const tab = shell.shadowRoot!.querySelector(`pb-nav-tab[href="${path}"]`)!;
    tab.shadowRoot!.querySelector('a')!.click();
    await app.updateComplete;
    if (app.shadowRoot!.querySelector('pb-history') === null) {
      await open(app, '/attestations');
    }
    const fresh = app.shadowRoot!.querySelector('pb-history')!;
    expect(fresh).not.toBe(history);
    await vi.waitFor(() => expect(attestationPage).toHaveBeenLastCalledWith({ limit: 100 }, expect.any(AbortSignal)));
  });

  test('discards the kept history after a second detail page', async () => {
    const { app, history } = await openHistory();
    await open(app, '/attestations/id-3', 'history');
    await open(app, '/attestations/id-4');
    await goBack(app);
    await goBack(app);
    const fresh = app.shadowRoot!.querySelector('pb-history')!;
    expect(fresh).not.toBe(history);
  });
});

async function mountAt(path: string) {
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.history.replaceState(null, '', path);
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const shell = app.shadowRoot!.querySelector<CockpitAppShell>('pb-app-shell')!;
  return { app, shell };
}

const status = (shell: CockpitAppShell) => shell.shadowRoot!.querySelector('pb-refresh-status');

// Verifies REQ-0019.
test('follows and clears a status filter on the same dashboard without reading again', async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const overview = respond(fixtureTargets.repositoryOverview)!.body as RepositoryOverview;
  vi.mocked(repositoryOverview).mockResolvedValueOnce(overview);
  const { app, shell } = await mountAt('/');
  const view = app.shadowRoot!.querySelector<DashboardView>('pb-dashboard')!;
  const root = view.shadowRoot!;
  await vi.waitFor(() => expect(shell.shadowRoot!.querySelector('.toolbar .sync')?.textContent)
    .toMatch(/Oldest covering sync.*stale/s));
  await vi.waitFor(() => expect(root.querySelector('pb-stat-tile')?.shadowRoot?.querySelector('a')).toBeTruthy());
  const failed = root.querySelector('pb-stat-tile')!.shadowRoot!.querySelector('a')!;
  const map = root.querySelector('pb-repository-map')!;
  const chipCount = () => map.shadowRoot!.querySelectorAll('pb-repo-chip').length;

  failed.click();
  await vi.waitFor(() => expect(chipCount()).toBe(4));
  expect(window.location.search).toBe('?status=failed');
  expect(failed.getAttribute('aria-current')).toBe('true');

  const section = map.shadowRoot!.querySelector('pb-widget')!.shadowRoot!.querySelector('pb-section')!;
  const clear = section.shadowRoot!.querySelector('a')!;
  clear.click();
  await vi.waitFor(() => expect(chipCount()).toBe(overview.repositories.length));
  expect(window.location.search).toBe('');
  expect(repositoryOverview).toHaveBeenCalledTimes(1);

  window.history.back();
  await vi.waitFor(() => expect(chipCount()).toBe(4));
  expect(app.shadowRoot!.querySelector('pb-dashboard')).toBe(view);
  expect(repositoryOverview).toHaveBeenCalledTimes(1);
});

// Verifies REQ-0020.
test.each([
  ['/', repositoryOverview],
  ['/attestations', attestationPage],
  ['/releases', releases],
  ['/deployments', deployments],
  ['/rules', registeredRules],
] as const)('reserves a toolbar below the header on %s before data arrives', async (path, read) => {
  let complete!: () => void;
  if (path === '/') {
    vi.mocked(repositoryOverview).mockReturnValueOnce(new Promise(resolve => {
      complete = () => resolve({ heartbeat: { completed_at: null, stale: true }, repositories: [] });
    }));
  } else {
    const pending = new Promise<[]>(resolve => { complete = () => resolve([]); });
    vi.mocked(read as (...args: never[]) => Promise<unknown[]>).mockReturnValueOnce(pending);
  }
  const { shell } = await mountAt(path);
  await shell.updateComplete;

  const root = shell.shadowRoot!;
  const toolbar = root.querySelector('header + .toolbar')!;
  expect(toolbar.nextElementSibling).toBe(root.querySelector('main'));
  expect(status(shell)).toBeNull();

  complete();
  await vi.waitFor(() => expect(status(shell)?.parentElement).toBe(toolbar));
  expect(status(shell)!.shadowRoot!.querySelector('button')?.getAttribute('aria-label')).toBe('Refresh');
});

// Verifies REQ-0020.
test.each([
  fixtureTargets.details[0].slice(3),
  fixtureTargets.releaseDetails[0].slice(3),
  '/repositories/detail' + fixtureTargets.releaseHistory.slice('/v0/releases'.length),
  fixtureTargets.ruleDetails[0].slice(3),
  fixtureTargets.ruleSetDetails[0].slice(3),
  '/missing',
])('reserves a toolbar without refresh status on %s', async path => {
  vi.mocked(getAttestation).mockReturnValue(new Promise(() => {}));
  vi.stubGlobal('fetch', vi.fn(async (target: string) => {
    const fixture = respond(target)!;
    return Response.json(fixture.body, { status: fixture.status });
  }));
  const { shell } = await mountAt(path);
  await shell.updateComplete;
  const root = shell.shadowRoot!;
  expect(root.querySelector('header + .toolbar')?.nextElementSibling).toBe(root.querySelector('main'));
  expect(status(shell)).toBeNull();
});

// Verifies REQ-0015.
test('places view controls in the toolbar', async () => {
  const { shell } = await mountAt('/rules');
  const control = document.createElement('button');
  control.slot = 'toolbar';
  shell.append(control);
  await shell.updateComplete;

  const slot = shell.shadowRoot!.querySelector<HTMLSlotElement>('.toolbar slot[name="toolbar"]');
  expect(slot?.assignedElements()).toEqual([control]);
});

// Verifies REQ-0020.
test('ages the text without a request and reads once per 5 minutes while visible', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const { shell } = await mountAt('/');
  await vi.waitFor(() => expect(status(shell)).not.toBeNull());
  const text = () => status(shell)!.shadowRoot!.querySelector('time')!.textContent;
  expect(text()).toBe('Updated a few seconds ago');
  expect(repositoryOverview).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(60_000);
  await vi.waitFor(() => expect(text()).toBe('Updated 1 minute ago'));
  expect(repositoryOverview).toHaveBeenCalledTimes(1);

  await vi.advanceTimersByTimeAsync(240_000);
  expect(repositoryOverview).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(300_000);
  expect(repositoryOverview).toHaveBeenCalledTimes(3);
});

// Verifies REQ-0020.
test('the button reads at once, is busy meanwhile and restarts the interval', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  const { shell } = await mountAt('/');
  await vi.waitFor(() => expect(status(shell)).not.toBeNull());
  await vi.advanceTimersByTimeAsync(200_000);

  let complete!: (value: RepositoryOverview) => void;
  vi.mocked(repositoryOverview).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const button = status(shell)!.shadowRoot!.querySelector('button')!;
  button.focus();
  button.click();
  expect(repositoryOverview).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('true'));
  button.click();
  expect(repositoryOverview).toHaveBeenCalledTimes(2);

  complete({ heartbeat: { completed_at: null, stale: true }, repositories: [] });
  await vi.waitFor(() => expect(button.getAttribute('aria-disabled')).toBe('false'));
  expect(status(shell)!.shadowRoot!.activeElement).toBe(button);
  expect(status(shell)!.shadowRoot!.querySelector('time')!.textContent).toBe('Updated a few seconds ago');

  await vi.advanceTimersByTimeAsync(299_000);
  expect(repositoryOverview).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(repositoryOverview).toHaveBeenCalledTimes(3);
});
