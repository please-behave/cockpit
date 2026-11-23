import { afterEach, expect, test } from 'vitest';
import { FactStrip } from './pb-fact-strip';

afterEach(() => document.body.replaceChildren());

test('renders ordered term and description pairs and allows long values to wrap', async () => {
  const list = new FactStrip();
  const longValue = 'a'.repeat(400);
  document.body.append(list);
  await list.updateComplete;
  expect(list.shadowRoot!.querySelector('dl')?.children).toHaveLength(0);

  list.items = [
    { term: 'Commit', description: longValue },
    { term: 'Sender', description: 'CI' },
  ];
  await list.updateComplete;

  const entries = [...list.shadowRoot!.querySelectorAll('dl > div')];
  expect(entries.map(entry => [...entry.children].map(element => [element.localName, element.textContent])))
    .toEqual([[['dt', 'Commit'], ['dd', longValue]], [['dt', 'Sender'], ['dd', 'CI']]]);
  expect(FactStrip.styles.cssText).toMatch(/overflow-wrap:\s*anywhere/);
});
