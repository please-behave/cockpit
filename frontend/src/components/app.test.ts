import { afterEach, describe, expect, test, vi } from 'vitest';
import { attestationPage, getAttestation, latestAttestations } from '../api/client';
import { CockpitApp } from './app';
import type { DetailView } from '../views/detail';
import type { DashboardView } from '../views/dashboard';
import type { HistoryView } from '../views/history';
import { CockpitAppShell } from './app-shell';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  latestAttestations: vi.fn(async () => []),
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
  const shell = app.shadowRoot?.querySelector('pb-app-shell') as CockpitAppShell;
  expect(shell).toBeInstanceOf(CockpitAppShell);
  await shell.updateComplete;

  const root = shell.shadowRoot!;
  expect(root.querySelector('header .logo-light')?.getAttribute('src')).toContain('logo.svg');
  expect(root.querySelector('header .logo-dark')?.getAttribute('src')).toContain('logo-dark.svg');
  expect(root.querySelector('header nav slot')?.getAttribute('name')).toBe('navigation');
  expect(root.querySelector('header slot[name="last-updated"]')).not.toBeNull();
  expect([...app.shadowRoot!.querySelectorAll('a[slot=navigation]')].map(link => [link.textContent, link.getAttribute('href')]))
    .toEqual([['Dashboard', '/'], ['Attestations', '/attestations'], ['Rules', '/rules']]);
  expect(root.querySelector('header a.sign-out')?.getAttribute('href')).toBe('/sign-out');
  expect(root.querySelector('main slot')).not.toBeNull();

  root.querySelector<HTMLAnchorElement>('.skip-link')!.click();
  expect(root.activeElement).toBe(root.querySelector('main'));
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
  expect(latestAttestations).toHaveBeenCalled();
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
    ['the menu entry', (app: CockpitApp) => app.shadowRoot!.querySelector<HTMLAnchorElement>('a[href="/attestations"]')!.click()],
    ['another view', (app: CockpitApp) => app.shadowRoot!.querySelector<HTMLAnchorElement>('a[href="/"]')!.click()],
  ])('discards the kept history after %s', async (_, leave) => {
    const { app, history } = await openHistory();
    await open(app, '/attestations/id-3', 'history');
    leave(app);
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
