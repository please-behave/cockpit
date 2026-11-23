import { afterEach, describe, expect, test, vi } from 'vitest';
import { ThemeToggle } from './components/pb-theme-toggle';
import { applyStoredTheme, effectiveTheme } from './theme';

function stubSystemTheme(dark: boolean) {
  const listeners: Array<() => void> = [];
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: dark,
    addEventListener: (_: string, listener: () => void) => listeners.push(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.splice(listeners.indexOf(listener), 1),
  })));
  return listeners;
}

async function mountToggle() {
  const element = new ThemeToggle();
  document.body.append(element);
  await element.updateComplete;
  const button = element.shadowRoot!.querySelector<HTMLButtonElement>('button')!;
  return { element, button };
}

function expectAction(button: HTMLButtonElement, target: 'light' | 'dark') {
  const name = `Switch to ${target} theme`;
  expect(button.getAttribute('aria-label')).toBe(name);
  expect(button.hasAttribute('title')).toBe(false);
  expect(button.parentElement).toMatchObject({ localName: 'pb-tooltip', description: name, hint: false });
  const icon = button.querySelector('svg');
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.querySelector('circle') !== null).toBe(target === 'light');
  expect(icon?.querySelector('path')).toBeTruthy();
}

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset.theme;
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Verifies REQ-0023.
describe('theme choice', () => {
  test('follows the system theme until the viewer chooses', async () => {
    const listeners = stubSystemTheme(true);
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    const { button } = await mountToggle();
    expectAction(button, 'light');
    expect(button.type).toBe('button');
    expect(listeners).toHaveLength(1);
  });

  test('reacts to a system change while no choice exists', async () => {
    const listeners = stubSystemTheme(false);
    const { element, button } = await mountToggle();
    expectAction(button, 'dark');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
    listeners[0]();
    await element.updateComplete;
    expectAction(button, 'light');
    element.remove();
    expect(listeners).toHaveLength(0);
  });

  test('a choice overrides the system theme and persists', async () => {
    const listeners = stubSystemTheme(true);
    const { element, button } = await mountToggle();
    button.click();
    await element.updateComplete;
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('cockpit-theme')).toBe('light');
    expectAction(button, 'dark');

    listeners[0]();
    await element.updateComplete;
    expectAction(button, 'dark');

    element.remove();
    delete document.documentElement.dataset.theme;
    applyStoredTheme();
    const reloaded = await mountToggle();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(effectiveTheme()).toBe('light');
    expectAction(reloaded.button, 'dark');
    reloaded.button.click();
    await reloaded.element.updateComplete;
    expect(localStorage.getItem('cockpit-theme')).toBe('dark');
    expectAction(reloaded.button, 'light');
  });

  test('ignores an unknown stored value', () => {
    stubSystemTheme(false);
    localStorage.setItem('cockpit-theme', 'sepia');
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(effectiveTheme()).toBe('light');
  });

  test('keeps working when storage is blocked', async () => {
    stubSystemTheme(true);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('blocked'); });
    applyStoredTheme();
    const { element, button } = await mountToggle();
    expectAction(button, 'light');
    button.click();
    await element.updateComplete;
    expect(document.documentElement.dataset.theme).toBe('light');
    expectAction(button, 'dark');
    button.click();
    await element.updateComplete;
    expect(document.documentElement.dataset.theme).toBe('dark');
    expectAction(button, 'light');
  });
});
