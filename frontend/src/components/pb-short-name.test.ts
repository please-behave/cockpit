import { afterEach, expect, test } from 'vitest';
import { ShortName, shortName } from './pb-short-name';

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
test('shows the short name, carries the full value as tooltip and reads it to assistive technology', async () => {
  const element = new ShortName();
  element.value = 'org/<img src=x>/name';
  document.body.append(element);
  await element.updateComplete;

  const root = element.shadowRoot!;
  expect(root.querySelector('[title]')?.getAttribute('title')).toBe('org/<img src=x>/name');
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
