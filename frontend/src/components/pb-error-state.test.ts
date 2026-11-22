import { html, render } from 'lit';
import { afterEach, expect, test, vi } from 'vitest';
import { ErrorState } from './pb-error-state';

afterEach(() => document.body.replaceChildren());

test('shows a user-facing error and makes retry optional', async () => {
  const state = new ErrorState();
  document.body.append(state);
  await state.updateComplete;

  const root = state.shadowRoot!;
  expect(root.querySelector('h2')?.textContent).toBe('Unable to load results');
  expect(root.querySelector('p')?.textContent).toBe('The results could not be loaded.');
  expect(root.querySelector('button')).toBeNull();

  state.retryable = true;
  await state.updateComplete;
  expect(root.querySelector('button')?.textContent).toBe('Retry');

  state.retryable = false;
  await state.updateComplete;
  expect(root.querySelector('button')).toBeNull();
});

test('the retry button emits a bubbling retry event across shadow roots', async () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const listener = vi.fn();
  host.addEventListener('retry', listener);
  document.body.append(host);
  render(html`<pb-error-state retryable></pb-error-state>`, shadow);
  const state = shadow.querySelector('pb-error-state') as ErrorState;
  await state.updateComplete;

  const button = state.shadowRoot!.querySelector('button')!;
  expect(button.type).toBe('button');
  button.click();

  expect(listener).toHaveBeenCalledTimes(1);
  expect(listener.mock.calls[0][0]).toMatchObject({ type: 'retry', bubbles: true, composed: true });
});
