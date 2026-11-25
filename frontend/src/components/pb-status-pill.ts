import { css, html, LitElement } from 'lit';

const statuses = new Map([
  ['PASS', { style: 'passed', symbol: '✓' }],
  ['FAIL', { style: 'failed', symbol: '×' }],
  ['ERROR', { style: 'error', symbol: '!' }],
  ['WARN', { style: 'warning', symbol: '▲' }],
  ['No evidence', { style: 'not-run', symbol: '–' }],
  ['NOT_RUN', { style: 'not-run', symbol: '–' }],
  ['Verified', { style: 'passed', symbol: '✓' }],
  ['Unverified', { style: 'warning', symbol: '▲' }],
  ['Complete', { style: 'passed', symbol: '✓' }],
  ['Incomplete', { style: 'warning', symbol: '▲' }],
  ['API key', { style: 'warning', symbol: '▲' }],
]);

export class StatusPill extends LitElement {
  static override properties = { status: { type: String } };

  static override styles = css`
    @layer components {
      .pill {
        display: inline-flex;
        max-inline-size: 100%;
        box-sizing: border-box;
        align-items: baseline;
        gap: var(--space-1);
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface-raised);
        color: var(--text-muted);
        font-weight: var(--weight-semibold);
        overflow-wrap: anywhere;
      }

      .passed { color: var(--status-passed); }
      .failed { color: var(--status-failed); }
      .error { color: var(--status-error); }
      .warning { color: var(--status-warning); }
      .not-run { color: var(--status-not-run); }
    }
  `;

  declare status: string;

  constructor() {
    super();
    this.status = '';
  }

  override render() {
    const status = statuses.get(this.status);
    return html`
      <span class="pill ${status?.style ?? 'unknown'}">
        <span aria-hidden="true">${status?.symbol ?? '?'}</span>
        <span>${this.status}</span>
      </span>
    `;
  }
}

customElements.define('pb-status-pill', StatusPill);
