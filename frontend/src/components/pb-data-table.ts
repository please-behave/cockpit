import { css, html, LitElement, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

export interface DataTableRow {
  /** Unique within the table and stable across updates. */
  key: string;
  cells: readonly (string | TemplateResult)[];
}

export class DataTable extends LitElement {
  static override properties = {
    label: { type: String },
    columns: { attribute: false },
    rows: { attribute: false },
    rowHeaderColumn: { type: Number, attribute: 'row-header-column' },
  };

  static override styles = css`
    @layer components {
      :host {
        display: block;
        min-inline-size: 0;
      }

      .scroll {
        overflow-x: auto;
      }

      a {
        color: inherit;
      }

      a:focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }

      td, th {
        overflow-wrap: anywhere;
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
        padding: var(--space-2) var(--space-3);
        text-align: start;
        vertical-align: top;
      }

      caption {
        font-weight: var(--weight-semibold);
        overflow-wrap: anywhere;
      }

      th, td {
        border-block-end: 1px solid var(--border);
      }

      thead {
        background: var(--surface-raised);
      }
    }
  `;

  declare label: string;
  declare columns: readonly string[];
  declare rows: readonly DataTableRow[];
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
    return html`
      <div class="scroll" role="region" aria-labelledby="caption" tabindex="0">
        <table>
          <caption id="caption">${this.label}</caption>
          <thead>
            <tr>${this.columns.map(column => html`<th scope="col">${column}</th>`)}</tr>
          </thead>
          <tbody>
            ${repeat(this.rows, row => row.key, row => html`
              <tr>${this.columns.map((_, index) => index === this.rowHeaderColumn
                ? html`<th scope="row">${row.cells[index]}</th>`
                : html`<td>${row.cells[index]}</td>`)}</tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }
}

customElements.define('pb-data-table', DataTable);
