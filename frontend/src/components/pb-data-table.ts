import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { linkStyles } from '../styles/links';
import { textStyles } from '../styles/text';
import './pb-icon';

export interface DataTableRow {
  /** Unique within the table and stable across updates. */
  key: string;
  cells: readonly (string | TemplateResult)[];
}

export interface DataTableGroup<Row extends DataTableRow = DataTableRow> {
  key: string;
  heading: string | TemplateResult;
  rows: readonly Row[];
}

export interface DataTableColumn<Row extends DataTableRow = DataTableRow> {
  label: string;
  /** Optional CSS part name for the column header and cells. */
  part?: string;
  /**
   * `content` keeps the column on one line at its natural width. `fill` takes the
   * remaining width and truncates with an ellipsis. Omit it to let content wrap.
   */
  mode?: 'content' | 'fill';
  /** Only opt in when the table contains the complete data set. */
  compare?: (left: Row, right: Row) => number;
}

type Sort = { index: number; direction: 'ascending' | 'descending' };

export class DataTable<Row extends DataTableRow = DataTableRow> extends LitElement {
  static override properties = {
    label: { type: String },
    columns: { attribute: false },
    rows: { attribute: false },
    groups: { attribute: false },
    rowHeaderColumn: { type: Number, attribute: 'row-header-column' },
    sort: { state: true },
  };

  static override styles = css`
    ${linkStyles}
    ${textStyles}

    @layer components {
      :host {
        display: block;
        min-inline-size: 0;
      }

      .scroll {
        /* Keep visually hidden cell labels inside the scrolling region. */
        position: relative;
        overflow-x: auto;
        overflow-y: hidden;
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

      .fill :is(a, span[tabindex="0"]) {
        display: inline-block;
        max-inline-size: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: top;
      }

      .fill span[tabindex="0"]:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-1 * var(--focus-offset));
      }

      .scroll:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-1 * var(--focus-offset));
      }

      table {
        inline-size: 100%;
        border-collapse: separate;
        border-spacing: 0;
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

      thead {
        position: relative;
        z-index: 1;
        transform: translateY(var(--header-offset, 0px));
      }

      thead th, th[scope='rowgroup'] {
        background: var(--panel-surface);
      }

      button {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        min-inline-size: var(--target-min-size);
        min-block-size: var(--target-min-size);
        max-inline-size: 100%;
        padding: 0 var(--space-1);
        border: 0;
        border-radius: var(--radius-control);
        background: var(--surface-transparent);
        color: inherit;
        font: inherit;
        text-align: start;
        cursor: pointer;
      }

      button:hover {
        background: var(--surface-hover);
        outline: 1px solid var(--border);
        outline-offset: -1px;
      }

      button:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-1 * var(--focus-offset));
      }
    }
  `;

  declare label: string;
  declare columns: readonly (string | DataTableColumn<Row>)[];
  declare rows: readonly Row[];
  declare groups?: readonly DataTableGroup<Row>[];
  /** Zero-based column index. Use -1 for a table without row headers. */
  declare rowHeaderColumn: number;

  declare private sort?: Sort;
  private horizontalScroll = 0;
  private headerOffset = 0;
  private headerStyle?: CSSStyleDeclaration;
  private resizeObserver?: ResizeObserver;

  constructor() {
    super();
    this.label = 'Results';
    this.columns = [];
    this.rows = [];
    this.rowHeaderColumn = -1;
  }

  override connectedCallback() {
    super.connectedCallback();
    const region = this.renderRoot.querySelector<HTMLDivElement>('.scroll');
    if (region) {
      region.scrollLeft = this.horizontalScroll;
      this.watchHeader();
    }
  }

  protected override firstUpdated() {
    if (this.isConnected) this.watchHeader();
  }

  override disconnectedCallback() {
    const viewport = this.ownerDocument.defaultView;
    viewport?.removeEventListener('scroll', this.pinHeader);
    viewport?.removeEventListener('resize', this.pinHeader);
    this.resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  private watchHeader() {
    const root = this.shadowRoot!;
    const viewport = this.ownerDocument.defaultView;
    if (!viewport || !root.adoptedStyleSheets) return;
    if (!this.headerStyle) {
      // The horizontal scroller captures native sticky positioning. Move the
      // original header with the page using an adopted rule for its offset.
      const sheet = new CSSStyleSheet();
      sheet.insertRule('thead {}');
      this.headerStyle = (sheet.cssRules[0] as CSSStyleRule).style;
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }

    const table = root.querySelector('table')!;
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver ??= new ResizeObserver(this.pinHeader);
      this.resizeObserver.observe(table);
      this.resizeObserver.observe(table.caption!);
      this.resizeObserver.observe(table.tHead!);
    }
    viewport.addEventListener('scroll', this.pinHeader, { passive: true });
    viewport.addEventListener('resize', this.pinHeader);
    this.pinHeader();
  }

  private readonly pinHeader = () => {
    const table = this.renderRoot.querySelector('table')!;
    const start = table.caption!.getBoundingClientRect().bottom;
    const end = table.getBoundingClientRect().bottom - table.tHead!.getBoundingClientRect().height;
    const offset = Math.max(0, Math.min(-start, end - start));
    if (offset === this.headerOffset) return;
    this.headerOffset = offset;
    this.headerStyle!.setProperty('--header-offset', `${offset}px`);
  };

  private rememberScroll(event: Event) {
    this.horizontalScroll = (event.currentTarget as HTMLDivElement).scrollLeft;
  }

  private revealFocus(event: FocusEvent) {
    const path = event.composedPath();
    const target = path[0] as Element;
    const table = this.renderRoot.querySelector('table')!;
    if (!target.matches(':focus-visible') || !Array.from(table.tBodies).some(body => path.includes(body))) return;
    const { top, bottom } = target.getBoundingClientRect();
    const header = table.tHead!.getBoundingClientRect();
    if (header.top <= 0 && bottom > 0 && top < header.bottom) {
      this.ownerDocument.defaultView?.scrollBy(0, top - header.bottom - 4);
    }
  }

  private sortBy(index: number) {
    const direction = this.sort?.index === index && this.sort.direction === 'ascending'
      ? 'descending' : 'ascending';
    this.sort = { index, direction };
  }

  override render() {
    const columns = this.columns.map(column => typeof column === 'string' ? { label: column } : column);
    const compare = this.sort && columns[this.sort.index]?.compare;
    const order = this.sort?.direction === 'descending' ? -1 : 1;
    const rows = (items: readonly Row[]) => repeat(
      compare ? [...items].sort((left, right) => order * compare(left, right)) : items,
      row => row.key,
      row => html`<tr>${columns.map(({ mode, part }, index) => index === this.rowHeaderColumn
        ? html`<th scope="row" class=${mode ?? nothing} part=${part ?? nothing}>${row.cells[index]}</th>`
        : html`<td class=${mode ?? nothing} part=${part ?? nothing}>${row.cells[index]}</td>`)}</tr>`,
    );
    return html`
      <div class="scroll" role="region" aria-labelledby="caption" tabindex="0"
        @scroll=${this.rememberScroll} @focusin=${this.revealFocus}>
        <table>
          <caption id="caption">${this.label}</caption>
          <thead>
              <tr>${columns.map(({ label, mode, part, compare }, index) => {
                const direction = compare && this.sort?.index === index ? this.sort.direction : undefined;
                return html`
                  <th scope="col" class=${mode ?? nothing} part=${part ?? nothing}
                    aria-sort=${direction ?? nothing}>${compare
                      ? html`<button type="button" @click=${() => this.sortBy(index)}>${label}<pb-icon
                          name=${direction ? `sort-${direction}` : 'sort'}></pb-icon></button>`
                      : label}</th>`;
              })}</tr>
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
