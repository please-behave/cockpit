import { afterEach, expect, test } from 'vitest';
import { CommitLink } from './pb-commit-link';
import type { Tooltip } from './pb-tooltip';

afterEach(() => document.body.replaceChildren());

async function mount(repository: string, commit: string) {
  const element = new CommitLink();
  element.repository = repository;
  element.commit = commit;
  document.body.append(element);
  await element.updateComplete;
  return element.shadowRoot!;
}

// Verifies REQ-0021.
test('links a verified repository value to the commit in a new tab', async () => {
  const root = await mount('github.com/acme/widget', '0123456789abcdef');
  const link = root.querySelector('a')!;
  expect(link.href).toBe('https://github.com/acme/widget/commit/0123456789abcdef');
  expect(link.rel).toBe('noopener noreferrer');
  expect(root.querySelector('code')!.textContent).toBe('0123456');
  expect(root.querySelector<Tooltip>('pb-tooltip')?.description).toBe('0123456789abcdef');
  expect(link.querySelector('code')?.getAttribute('aria-hidden')).toBe('true');
  expect(link.querySelector('pb-icon')?.getAttribute('name')).toBe('external-link');
  expect(link.querySelector('.assistive')?.textContent).toBe('0123456789abcdef (opens in a new tab)');
});

// Verifies REQ-0021.
test('shows plain text for other repository values and keeps short commits whole', async () => {
  const root = await mount('github.com/acme/widget/<img>', 'abc');
  expect(root.querySelector('a')).toBeNull();
  expect(root.querySelector('code')!.textContent).toBe('abc');
  expect(root.querySelector('pb-tooltip')).toBeNull();
});
