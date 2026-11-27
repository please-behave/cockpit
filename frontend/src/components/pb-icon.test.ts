import { afterEach, expect, test } from 'vitest';
import { icons } from './icons';
import { Icon } from './pb-icon';

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0015 and REQ-0016.
test('renders distinct SVG artwork with a common grid, stroke and inherited color', async () => {
  const artwork = new Set<string>();
  const serializer = new XMLSerializer();
  for (const name of Object.keys(icons)) {
    const icon = new Icon();
    icon.setAttribute('name', name);
    document.body.append(icon);
    await icon.updateComplete;

    const svg = icon.shadowRoot!.querySelector('svg')!;
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    artwork.add(Array.from(svg.children, element => serializer.serializeToString(element)).join(''));
  }
  expect(artwork.size).toBe(Object.keys(icons).length);
});

test('exposes a standalone icon by name and hides it when the label is removed', async () => {
  const icon = new Icon();
  icon.name = 'external-link';
  icon.label = 'Opens in a new tab';
  document.body.append(icon);
  await icon.updateComplete;

  const svg = icon.shadowRoot!.querySelector('svg')!;
  expect(svg.getAttribute('role')).toBe('img');
  expect(svg.getAttribute('aria-label')).toBe(icon.label);
  expect(svg.hasAttribute('aria-hidden')).toBe(false);

  icon.label = ' ';
  await icon.updateComplete;
  expect(svg.hasAttribute('role')).toBe(false);
  expect(svg.hasAttribute('aria-label')).toBe(false);
  expect(svg.getAttribute('aria-hidden')).toBe('true');
});

test('does not render unrecognized icon names', async () => {
  const icon = new Icon();
  icon.setAttribute('name', 'constructor');
  document.body.append(icon);
  await icon.updateComplete;

  expect(icon.shadowRoot!.querySelector('svg')).toBeNull();
});
