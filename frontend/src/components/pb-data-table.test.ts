import { html } from 'lit';
import { afterEach, expect, test, vi } from 'vitest';
import { DataTable } from './pb-data-table';
import './pb-status-pill';

afterEach(() => document.body.replaceChildren());

test('exposes a named table with column and optional row headers in a focusable scroller', async () => {
  const table = new DataTable();
  table.label = 'Reported checks';
  table.columns = ['Status', 'Check', 'Details'];
  table.rowHeaderColumn = 1;
  table.rows = [{
    key: 'format',
    cells: [
      html`<pb-status-pill status="PASS"></pb-status-pill>`,
      'Format',
      html`<a href="/attestations">View evidence</a>`,
    ],
  }];
  document.body.append(table);
  await table.updateComplete;

  const root = table.shadowRoot!;
  const caption = root.querySelector('table caption')!;
  const scroller = root.querySelector<HTMLElement>('[role="region"]')!;
  expect(caption.textContent).toBe('Reported checks');
  expect(scroller.getAttribute('aria-labelledby')).toBe(caption.id);
  expect(scroller.tabIndex).toBe(0);
  scroller.focus();
  expect(root.activeElement).toBe(scroller);
  expect(DataTable.styles.cssText).toMatch(/overflow-x:\s*auto/);
  expect([...root.querySelectorAll('thead th[scope="col"]')].map(cell => cell.textContent))
    .toEqual(['Status', 'Check', 'Details']);
  expect(root.querySelector('tbody th[scope="row"]')?.textContent).toBe('Format');
  expect(root.querySelector('tbody td pb-status-pill')).not.toBeNull();
  expect(root.querySelector('tbody td a')?.getAttribute('href')).toBe('/attestations');

  table.rowHeaderColumn = -1;
  await table.updateComplete;
  expect(root.querySelector('tbody th')).toBeNull();
  expect(root.querySelectorAll('tbody td')).toHaveLength(3);
});

// Verifies REQ-0018.
test('pins the original column headers to the page viewport within the table bounds', async () => {
  const component = new DataTable();
  component.columns = ['Name'];
  document.body.append(component);
  await component.updateComplete;

  const root = component.shadowRoot!;
  const table = root.querySelector('table')!;
  const header = table.tHead!;
  const caption = vi.spyOn(table.caption!, 'getBoundingClientRect');
  const bounds = vi.spyOn(table, 'getBoundingClientRect');
  vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ height: 40 }));
  const rule = root.adoptedStyleSheets.at(-1)!.cssRules[0] as CSSStyleRule;

  function pageScroll(start: number, end: number) {
    caption.mockReturnValue(DOMRect.fromRect({ y: start }));
    bounds.mockReturnValue(DOMRect.fromRect({ y: start, height: end - start }));
    window.dispatchEvent(new Event('scroll'));
    return rule.style.getPropertyValue('--header-offset');
  }

  expect(pageScroll(-90, 210)).toBe('90px');
  expect(pageScroll(-275, 25)).toBe('260px');
  expect(pageScroll(15, 315)).toBe('0px');
  expect(header.hasAttribute('style')).toBe(false);
});

test('retains rows by key through reordering, updates, insertion and removal', async () => {
  const table = new DataTable();
  table.columns = ['Name'];
  document.body.append(table);
  await table.updateComplete;

  const body = table.shadowRoot!.querySelector('tbody')!;
  expect(body.rows).toHaveLength(0);
  table.rows = [
    { key: 'one', cells: ['One'] },
    { key: 'two', cells: ['Two'] },
    { key: 'three', cells: ['Three'] },
  ];
  await table.updateComplete;
  const [one, two] = Array.from(body.rows);

  table.rows = [
    { key: 'two', cells: ['Updated two'] },
    { key: 'four', cells: ['Four'] },
    { key: 'one', cells: ['One'] },
  ];
  await table.updateComplete;
  expect(body.rows).toHaveLength(3);
  expect(body.rows[0]).toBe(two);
  expect(body.rows[0].cells[0].textContent).toBe('Updated two');
  expect(body.rows[1].cells[0].textContent).toBe('Four');
  expect(body.rows[2]).toBe(one);
});

// Verifies REQ-0018.
test('keeps content columns on one line, truncates fill columns and leaves other columns wrapping', async () => {
  const table = new DataTable();
  table.columns = [{ label: 'Rule', mode: 'fill' }, { label: 'Kind', mode: 'content' }, 'Notes'];
  table.rowHeaderColumn = 0;
  table.rows = [{ key: 'one', cells: ['A very long rule', 'check', 'Wraps'] }];
  document.body.append(table);
  await table.updateComplete;

  const root = table.shadowRoot!;
  expect([...root.querySelectorAll('thead th')].map(cell => cell.className)).toEqual(['fill', 'content', '']);
  const row = root.querySelector('tbody tr')!;
  expect(Array.from(row.children).map(cell => cell.className)).toEqual(['fill', 'content', '']);
  expect(row.querySelector('th')?.getAttribute('scope')).toBe('row');
  const css = DataTable.styles.cssText;
  expect(css).toMatch(/\.content\s*{[^}]*white-space:\s*nowrap/);
  expect(css).toMatch(/\.fill\s*{[^}]*text-overflow:\s*ellipsis/);
});

// Verifies REQ-0018.
test('sorts opt-in columns stably within each group and keeps focus on the header button', async () => {
  const table = new DataTable<{ key: string; cells: string[]; rank: number }>();
  table.columns = [
    { label: 'Name', compare: (a, b) => a.cells[0].localeCompare(b.cells[0]) },
    { label: 'Rank', compare: (a, b) => a.rank - b.rank },
    'Notes',
  ];
  const original = [
    { key: 'first-tie', cells: ['Zulu', '2', 'First'], rank: 2 },
    { key: 'low', cells: ['Alpha', '1', ''], rank: 1 },
    { key: 'second-tie', cells: ['Beta', '2', 'Second'], rank: 2 },
  ];
  table.groups = [
    { key: 'first', heading: 'First group', rows: original },
    { key: 'second', heading: 'Second group', rows: [{ key: 'other', cells: ['Other', '0', ''], rank: 0 }] },
  ];
  document.body.append(table);
  await table.updateComplete;

  const root = table.shadowRoot!;
  const [name, rank, notes] = root.querySelectorAll('thead th');
  const names = () => Array.from(root.querySelectorAll('tbody tr td:first-child'), cell => cell.textContent);
  const sort = (button: HTMLButtonElement) => {
    button.click();
    return table.updateComplete;
  };
  expect(notes.querySelector('button')).toBeNull();
  expect(root.querySelector('[aria-sort]')).toBeNull();
  expect(names()).toEqual(['Zulu', 'Alpha', 'Beta', 'Other']);
  const rankButton = rank.querySelector('button')!;
  expect(rankButton.querySelector('pb-icon')?.getAttribute('name')).toBe('sort');
  rankButton.focus();

  await sort(rankButton);
  expect(rank.getAttribute('aria-sort')).toBe('ascending');
  expect(rankButton.querySelector('pb-icon')?.getAttribute('name')).toBe('sort-ascending');
  expect(root.activeElement).toBe(rankButton);
  expect(names()).toEqual(['Alpha', 'Zulu', 'Beta', 'Other']);

  await sort(rankButton);
  expect(rank.getAttribute('aria-sort')).toBe('descending');
  expect(rankButton.querySelector('pb-icon')?.getAttribute('name')).toBe('sort-descending');
  expect(root.activeElement).toBe(rankButton);
  expect(names()).toEqual(['Zulu', 'Beta', 'Alpha', 'Other']);

  await sort(name.querySelector('button')!);
  expect(name.getAttribute('aria-sort')).toBe('ascending');
  expect(rank.hasAttribute('aria-sort')).toBe(false);
  expect(rankButton.querySelector('pb-icon')?.getAttribute('name')).toBe('sort');
  expect(notes.hasAttribute('aria-sort')).toBe(false);
  expect(names()).toEqual(['Alpha', 'Beta', 'Zulu', 'Other']);
  expect(original.map(row => row.key)).toEqual(['first-tie', 'low', 'second-tie']);
});
