import { afterEach, expect, test, vi } from 'vitest';
import { getAttestation, latestAttestations } from '../api/client';
import { CockpitApp } from './app';
import type { DetailView } from '../views/detail';
import type { DashboardView } from '../views/dashboard';
import { CockpitAppShell } from './app-shell';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  latestAttestations: vi.fn(async () => []),
  getAttestation: vi.fn(),
}));

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
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
  expect(root.querySelector('header img')?.getAttribute('src')).toContain('logo.svg');
  expect(root.querySelector('header source')?.getAttribute('srcset')).toContain('logo-dark.svg');
  expect(root.querySelector('header nav slot')?.getAttribute('name')).toBe('navigation');
  expect(root.querySelector('header slot[name="last-updated"]')).not.toBeNull();
  expect(app.shadowRoot!.querySelector('a[slot=navigation]')?.textContent).toBe('Dashboard');
  expect(root.querySelector('header a')?.getAttribute('href')).toBe('/sign-out');
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
