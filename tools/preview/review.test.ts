import { expect, test, vi } from 'vitest';
import { routeFor, routePatterns } from '../../frontend/src/views/router';
import { respond } from './fixtures.mjs';
import { viewManifest } from './review-cases.mjs';
import { inventory } from './review-inventory.mjs';
import { fullyVisible, measure, queryDeep, spansLines } from './review-metrics.mjs';

const rect = (top: number, bottom: number, width = 100) => new DOMRect(0, top, width, bottom - top);

test('the manifest covers every router pattern with a working fixture address', () => {
  const routes: string[] = viewManifest.map(({ path }: { path: string }) => path);
  expect(new Set(routes).size).toBe(routes.length);
  for (const [name, pattern] of Object.entries(routePatterns)) {
    expect(viewManifest.some(({ path, selector }: { path: string; selector: string }) => {
      const pathname = path.split('?')[0];
      return (typeof pattern === 'string' ? pathname === pattern : pattern.test(pathname))
        && selector !== 'pb-error-state' && routeFor(path).view !== 'not-found';
    }), name).toBe(true);
  }
  expect(viewManifest.some(({ path, root }: { path: string; root: string }) =>
    root === 'pb-not-found' && routeFor(path).view === 'not-found')).toBe(true);
  for (const { path, selector } of viewManifest) {
    const route = routeFor(path);
    if (route.view === 'detail' || route.view === 'release' || route.view === 'rule' || route.view === 'rule-set') {
      expect(respond('/v0' + path)?.status, path).toBe(selector === 'pb-error-state' ? 404 : 200);
    }
    if (route.view === 'repository') {
      const query = new URLSearchParams({ repository: route.repository });
      expect(respond('/v0/releases?' + query)?.body, path).not.toEqual([]);
      expect(respond('/v0/deployments?' + query)?.body, path).not.toEqual([]);
      expect(respond('/v0/attestations?' + query)?.body, path).not.toEqual([]);
    }
  }
});

test('inventories two forms of the same classification and finds a repeated popup by hovering', async () => {
  const fixture = document.createElement('div');
  fixture.innerHTML = `
    <pb-badge tone="check" style="border-radius: 3px; font-weight: 600">check</pb-badge>
    <pb-badge tone="check" style="border-radius: 12px; font-weight: 600">check</pb-badge>
    <pb-tooltip external-trigger><button>Same label</button></pb-tooltip>`;
  document.body.append(fixture);
  const tooltip = fixture.querySelector('pb-tooltip')!;
  const shadow = tooltip.attachShadow({ mode: 'open' });
  shadow.innerHTML = '<div><slot></slot><span popover="manual" aria-hidden="true" hidden>Same label</span></div>';
  const popup = shadow.querySelector<HTMLElement>('[popover]')!;
  const focus = vi.spyOn(tooltip.querySelector('button')!, 'focus');
  const hover = vi.fn(() => { window.setTimeout(() => { popup.hidden = false; }, 100); });
  shadow.firstElementChild!.addEventListener('pointerenter', hover);
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([rect(0, 25)] as unknown as DOMRectList);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  try {
    const { groups, probed } = await inventory(document);
    expect(probed).toBe(1);
    expect(focus).toHaveBeenCalledOnce();
    expect(hover).toHaveBeenCalledOnce();
    expect(groups.filter(group => group.category === 'Classifications').map(group => group.name))
      .toEqual([expect.stringContaining('check · radius 3px'), expect.stringContaining('check · radius 12px')]);
    expect(groups).toContainEqual({ category: 'Repeated popups', name: 'Cockpit popup', example: 'Same label', count: 1 });
  } finally {
    vi.restoreAllMocks();
    fixture.remove();
  }
});

test('counts only entries that fit completely between the viewport edges', () => {
  expect(fullyVisible(rect(0, 900), 0, 900)).toBe(true);
  expect(fullyVisible(rect(890, 910), 0, 900)).toBe(false);
  expect(fullyVisible(rect(-5, 11), 0, 900)).toBe(false);
  expect(fullyVisible(rect(0, 0), 0, 900)).toBe(false);
  expect(fullyVisible(rect(21, 100.001), 20, 100)).toBe(true);
});

test('distinguishes a second line from mixed font sizes and zero-width fragments', () => {
  expect(spansLines([rect(3, 15), rect(1, 17), rect(20, 30, 0)])).toBe(false);
  expect(spansLines([rect(3, 15), rect(16, 26)])).toBe(true);
  expect(spansLines([])).toBe(false);
});

test('measures through shadow roots and accounts for nested vertical clipping', () => {
  const page = document.implementation.createHTMLDocument();
  const root = page.createElement('div');
  const shadow = root.attachShadow({ mode: 'open' });
  const scroll = page.createElement('div');
  const first = page.createElement('div');
  const second = page.createElement('div');
  page.body.append(root);
  shadow.append(scroll);
  scroll.append(first, second);
  first.textContent = 'Wrapped text';
  second.textContent = 'Clipped text';
  scroll.style.overflowY = 'auto';
  Object.defineProperties(page.documentElement, {
    clientHeight: { value: 900 },
    clientWidth: { value: 320 },
    scrollWidth: { value: 324 },
  });
  Object.defineProperties(scroll, {
    clientTop: { value: 2 },
    clientHeight: { value: 50 },
  });
  Object.defineProperty(page, 'defaultView', { value: window });
  vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(rect(20, 75));
  vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(rect(22, 63));
  vi.spyOn(second, 'getBoundingClientRect').mockReturnValue(rect(63, 90));
  vi.spyOn(window, 'getComputedStyle').mockImplementation(element => ({
    display: 'block', visibility: 'visible', position: 'static',
    overflowY: element === scroll ? 'auto' : 'visible',
  }) as CSSStyleDeclaration);
  vi.spyOn(page, 'createRange').mockImplementation(() => {
    let text: Node;
    return {
      selectNodeContents(node: Node) { text = node; },
      getClientRects() { return text === first.firstChild ? [rect(24, 39), rect(43, 58)] : [rect(64, 79)]; },
    } as Range;
  });

  try {
    const entries = queryDeep(root, 'div > div');
    expect(entries).toEqual([first, second]);
    expect(measure(page, entries)).toEqual({
      visible: 1, header: 0, toolbar: 0, wrapped: 1, overflow: 4,
    });
  } finally {
    vi.restoreAllMocks();
  }
});
