import { html } from 'lit';
import { afterEach, expect, test } from 'vitest';
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
