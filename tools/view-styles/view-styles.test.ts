// @vitest-environment node
import { expect, test } from 'vitest';
import { exceptions } from './exceptions';
import { findings, unexplained, unused, viewSources, type Exception } from './view-styles';

const view = (rules: string) => `static override styles = css\`\n  @layer components {\n${rules}\n  }\n\`;`;

test('flags borders, backgrounds, radii, shadows, colors, font size and weight', () => {
  const source = view(`
    select { border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--surface); }
    .note { color: var(--text-muted); font-size: var(--type-meta); font-weight: bold; box-shadow: none; }
    pb-data-table::part(name) { font: inherit; }
  `);
  expect(findings('sample.ts', source).map(({ selector, property }) => `${selector} ${property}`)).toEqual([
    'select border', 'select border-radius', 'select background',
    '.note color', '.note font-size', '.note font-weight', '.note box-shadow',
    'pb-data-table::part(name) font',
  ]);
});

test('reports the source line of a finding', () => {
  expect(findings('sample.ts', `\n\n${view('.a { color: red; }')}`)[0].line).toBe(5);
});

test('accepts layout-only styles', () => {
  const source = view(`
    :host { display: block; overflow-wrap: anywhere; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); margin: 0; padding: 0; }
    .row { display: flex; flex-wrap: wrap; align-items: baseline; inline-size: 20%; min-block-size: 24px; }
  `);
  expect(findings('sample.ts', source)).toEqual([]);
});

test('ignores interpolations and code outside style blocks', () => {
  const source = `const color = 'red'; ${view('.a { display: block; }')}`;
  expect(findings('sample.ts', source)).toEqual([]);
});

test('lets an exception cover a selector in its file only', () => {
  const found = findings('a.ts', view('.a { color: red; } .b { color: red; }'));
  const entry: Exception = { file: 'a.ts', selector: '.a', reason: 'Because.' };
  expect(unexplained(found, [entry]).map(({ selector }) => selector)).toEqual(['.b']);
  expect(unexplained(found, [{ ...entry, file: 'b.ts' }])).toHaveLength(2);
  expect(unused(found, [entry, { ...entry, selector: '.gone' }])).toEqual([{ ...entry, selector: '.gone' }]);
});

test('every exception states its reason', () => {
  for (const entry of exceptions) expect(entry.reason.trim(), `${entry.file} ${entry.selector}`).not.toBe('');
});

test('views style no shared elements beyond the listed exceptions', () => {
  const sources = viewSources(new URL('../../frontend/src/views', import.meta.url).pathname);
  const found = sources.flatMap(({ file, source }) => findings(file, source));
  expect(unexplained(found, exceptions).map(({ file, line, selector, property }) => `${file}:${line} ${selector} ${property}`)).toEqual([]);
  expect(unused(found, exceptions)).toEqual([]);
});
