import { afterEach, expect, test } from 'vitest';
import { NavTab } from './pb-nav-tab';

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0015.
test('renders a focusable native link and updates its current-page state', async () => {
  const tab = new NavTab();
  tab.href = '/attestations';
  tab.textContent = 'Attestations';
  document.body.append(tab);
  await tab.updateComplete;

  const link = tab.shadowRoot!.querySelector('a')!;
  expect(link.getAttribute('href')).toBe('/attestations');
  expect(link.querySelector('slot')?.assignedNodes()).toEqual([...tab.childNodes]);
  expect(link.hasAttribute('aria-current')).toBe(false);

  link.focus();
  expect(tab.shadowRoot!.activeElement).toBe(link);
  expect(link.tabIndex).toBe(0);

  tab.active = true;
  await tab.updateComplete;
  expect(link.getAttribute('aria-current')).toBe('page');

  tab.active = false;
  await tab.updateComplete;
  expect(link.hasAttribute('aria-current')).toBe(false);
});
