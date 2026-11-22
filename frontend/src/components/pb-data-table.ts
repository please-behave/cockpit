import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

export interface DataTableRow {
  /** Unique within the table and stable across updates. */
  key: string;
  cells: readonly (string | TemplateResult)[];
}

export interface DataTableColumn {
  label: string;
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

      .content {
        inline-size: 1%;
        white-space: nowrap;
      }

      .fill {
        inline-size: 100%;
        max-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
  declare columns: readonly (string | DataTableColumn)[];
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
    const columns = this.columns.map(column => typeof column === 'string' ? { label: column } : column);
    return html`
      <div class="scroll" role="region" aria-labelledby="caption" tabindex="0">
        <table>
          <caption id="caption">${this.label}</caption>
          <thead>
            <tr>${columns.map(({ label, mode }) => html`<th scope="col" class=${mode ?? nothing}>${label}</th>`)}</tr>
          </thead>
          <tbody>
            ${repeat(this.rows, row => row.key, row => html`
              <tr>${columns.map(({ mode }, index) => index === this.rowHeaderColumn
                ? html`<th scope="row" class=${mode ?? nothing}>${row.cells[index]}</th>`
                : html`<td class=${mode ?? nothing}>${row.cells[index]}</td>`)}</tr>
            `)}
          </tbody>
        </table>
      </div>
    `;
  }
}

customElements.define('pb-data-table', DataTable);
