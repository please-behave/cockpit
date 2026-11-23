import { afterEach, expect, test } from 'vitest';
import { ownerName, ShortName, shortName } from './pb-short-name';

afterEach(() => document.body.replaceChildren());

// Verifies REQ-0017.
test.each([
  ['git:0a1b:ruleset/example/rule-name', 'rule-name'],
  ['rule-name', 'rule-name'],
  ['trailing/', ''],
  ['', ''],
])('shortens %j to %j', (value, expected) => {
  expect(shortName(value)).toBe(expected);
});

// Verifies REQ-0017.
test('shows the short name and exposes the full value to assistive technology', async () => {
  const element = new ShortName();
  element.value = 'org/<img src=x>/name';
  document.body.append(element);
  await element.updateComplete;

  const root = element.shadowRoot!;
  expect(root.querySelector('[title]')).toBeNull();
  expect(root.querySelector('.short')?.textContent).toBe('name');
  expect(root.querySelector('.short')?.getAttribute('aria-hidden')).toBe('true');
  expect(root.querySelector('.assistive')?.textContent).toBe('org/<img src=x>/name');
  expect(root.querySelector('img')).toBeNull();
});

test('renders nothing for an empty value', async () => {
  const element = new ShortName();
  document.body.append(element);
  await element.updateComplete;

  expect(element.shadowRoot!.querySelector('span')).toBeNull();
});

// Verifies REQ-0019.
test('names the owner as the segment before the shortened name', () => {
  expect(ownerName('github.com/acme/widget')).toBe('acme');
  expect(ownerName('acme/widget')).toBe('acme');
  expect(ownerName('widget')).toBe('');
});
