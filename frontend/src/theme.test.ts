import { afterEach, describe, expect, test, vi } from 'vitest';
import { CockpitAppShell } from './components/app-shell';
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

async function shell() {
  const element = new CockpitAppShell();
  document.body.append(element);
  await element.updateComplete;
  const button = element.shadowRoot!.querySelector<HTMLButtonElement>('button.theme-toggle')!;
  return { element, button };
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
    const { button } = await shell();
    expect(button.textContent?.trim()).toBe('Switch to light theme');
    expect(button.type).toBe('button');
    expect(listeners).toHaveLength(1);
  });

  test('reacts to a system change while no choice exists', async () => {
    const listeners = stubSystemTheme(false);
    const { element, button } = await shell();
    expect(button.textContent?.trim()).toBe('Switch to dark theme');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} })));
    listeners[0]();
    await element.updateComplete;
    expect(button.textContent?.trim()).toBe('Switch to light theme');
    element.remove();
    expect(listeners).toHaveLength(0);
  });

  test('a choice overrides the system theme and persists', async () => {
    stubSystemTheme(true);
    const { element, button } = await shell();
    button.click();
    await element.updateComplete;
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('cockpit-theme')).toBe('light');
    expect(button.textContent?.trim()).toBe('Switch to dark theme');

    document.body.replaceChildren();
    delete document.documentElement.dataset.theme;
    applyStoredTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(effectiveTheme()).toBe('light');
    button.click();
    expect(localStorage.getItem('cockpit-theme')).toBe('dark');
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
    const { element, button } = await shell();
    expect(button.textContent?.trim()).toBe('Switch to light theme');
    button.click();
    await element.updateComplete;
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(button.textContent?.trim()).toBe('Switch to dark theme');
    button.click();
    await element.updateComplete;
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(button.textContent?.trim()).toBe('Switch to light theme');
  });
});
