import { afterEach, expect, test } from 'vitest';
import { CockpitApp } from './app';

afterEach(() => document.body.replaceChildren());

test('pb-app renders in its shadow root', async () => {
  const app = document.createElement('pb-app');
  expect(app).toBeInstanceOf(CockpitApp);
  document.body.append(app);
  await (app as CockpitApp).updateComplete;

  expect(app.shadowRoot?.querySelector('h1')?.textContent).toBe('Please Behave Cockpit');
});
