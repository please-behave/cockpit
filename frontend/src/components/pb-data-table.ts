import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { linkStyles } from '../styles/links';

export interface DataTableRow {
  /** Unique within the table and stable across updates. */
  key: string;
  cells: readonly (string | TemplateResult)[];
}

export interface DataTableGroup {
  key: string;
  heading: string | TemplateResult;
  rows: readonly DataTableRow[];
}

export interface DataTableColumn {
  label: string;
  /** Optional CSS part name for the column header and cells. */
  part?: string;
  /**
   * `content` keeps the column on one line at its natural width. `fill` takes the
   * remaining width and truncates with an ellipsis. Omit it to let content wrap.
   */
  mode?: 'content' | 'fill';
}

export class DataTable extends LitElement {
  static override properties = {
    label: { type: String },
    columns: { attribute: false },
    rows: { attribute: false },
    groups: { attribute: false },
    rowHeaderColumn: { type: Number, attribute: 'row-header-column' },
  };

  static override styles = css`
    ${linkStyles}

    @layer components {
      :host {
        display: block;
        min-inline-size: 0;
      }

      .scroll {
        /* Keep visually hidden cell labels inside the scrolling region. */
        position: relative;
        overflow-x: auto;
      }

      td, th {
        overflow-wrap: anywhere;
      }

      .content {
        inline-size: 1%;
        white-space: nowrap;
      }

      .fill {
        inline-size: 100%;
        min-inline-size: var(--target-min-size);
        max-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .fill a {
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: top;
      }

      .scroll:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-1 * var(--focus-offset));
      }

      table {
        inline-size: 100%;
        border-collapse: collapse;
        background: var(--surface);
        color: var(--text);
      }

      caption, th, td {
        padding: var(--cell-padding-block) var(--control-padding-inline);
        text-align: start;
        vertical-align: top;
      }

      caption {
        font-weight: var(--weight-semibold);
        overflow-wrap: anywhere;
      }

      th, td {
        border-block-end: 1px solid var(--border-subtle);
      }

      thead, th[scope='rowgroup'] {
        background: var(--surface-raised);
      }
    }
  `;

  declare label: string;
  declare columns: readonly (string | DataTableColumn)[];
  declare rows: readonly DataTableRow[];
  declare groups?: readonly DataTableGroup[];
  /** Zero-based column index. Use -1 for a table without row headers. */
  declare rowHeaderColumn: number;

  constructor() {
    super();
    this.label = 'Results';
    this.columns = [];
    this.rows = [];
    this.rowHeaderColumn = -1;
  }

  override render() {
    const columns = this.columns.map(column => typeof column === 'string' ? { label: column } : column);
    const rows = (items: readonly DataTableRow[]) => repeat(items, row => row.key, row => html`
      <tr>${columns.map(({ mode, part }, index) => index === this.rowHeaderColumn
        ? html`<th scope="row" class=${mode ?? nothing} part=${part ?? nothing}>${row.cells[index]}</th>`
        : html`<td class=${mode ?? nothing} part=${part ?? nothing}>${row.cells[index]}</td>`)}</tr>
    `);
    return html`
      <div class="scroll" role="region" aria-labelledby="caption" tabindex="0">
        <table>
          <caption id="caption">${this.label}</caption>
          <thead>
            <tr>${columns.map(({ label, mode, part }) => html`
              <th scope="col" class=${mode ?? nothing} part=${part ?? nothing}>${label}</th>`)}</tr>
          </thead>
          ${this.groups === undefined ? html`<tbody>${rows(this.rows)}</tbody>`
            : repeat(this.groups, group => group.key, group => html`
              <tbody>
                <tr><th scope="rowgroup" colspan=${columns.length}>${group.heading}</th></tr>
                ${rows(group.rows)}
              </tbody>
            `)}
        </table>
      </div>
    `;
  }
}

customElements.define('pb-data-table', DataTable);
