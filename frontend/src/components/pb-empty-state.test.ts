import { afterEach, expect, test } from 'vitest';
import { EmptyState } from './pb-empty-state';

afterEach(() => document.body.replaceChildren());

test('presents default and customized empty messages under a heading', async () => {
  const state = new EmptyState();
  document.body.append(state);
  await state.updateComplete;

  const root = state.shadowRoot!;
  expect(root.querySelector('h2')?.textContent).toBe('No results');
  expect(root.querySelector('p')?.textContent).toBe('There is nothing to show yet.');

  state.setAttribute('heading', 'No attestations');
  state.setAttribute('message', 'Submitted attestations will appear here.');
  await state.updateComplete;
  expect(root.querySelector('h2')?.textContent).toBe('No attestations');
  expect(root.querySelector('p')?.textContent).toBe('Submitted attestations will appear here.');
});
