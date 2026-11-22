import { afterEach, expect, test } from 'vitest';
import { CockpitApp } from './app';
import { CockpitAppShell } from './app-shell';

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0015.
test('pb-app renders its content in the application shell', async () => {
  const app = document.createElement('pb-app');
  expect(app).toBeInstanceOf(CockpitApp);
  document.body.append(app);
  await (app as CockpitApp).updateComplete;

  expect(app.shadowRoot?.querySelector('h1')?.textContent).toBe('Please Behave Cockpit');
  const shell = app.shadowRoot?.querySelector('pb-app-shell') as CockpitAppShell;
  expect(shell).toBeInstanceOf(CockpitAppShell);
  await shell.updateComplete;

  const root = shell.shadowRoot!;
  expect(root.querySelector('header img')?.getAttribute('src')).toContain('logo.svg');
  expect(root.querySelector('header source')?.getAttribute('srcset')).toContain('logo-dark.svg');
  expect(root.querySelector('header nav slot')?.getAttribute('name')).toBe('navigation');
  expect(root.querySelector('header slot[name="last-updated"]')).not.toBeNull();
  expect(root.querySelector('header a')?.getAttribute('href')).toBe('/sign-out');
  expect(root.querySelector('main slot')).not.toBeNull();

  root.querySelector<HTMLAnchorElement>('.skip-link')!.click();
  expect(root.activeElement).toBe(root.querySelector('main'));
});
