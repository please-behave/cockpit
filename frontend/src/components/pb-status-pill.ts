import { css, html, LitElement } from 'lit';
import type { IconName } from './icons';
import './pb-icon';

const statuses = new Map<string, { style: string; icon: IconName }>([
  ['PASS', { style: 'passed', icon: 'check' }],
  ['FAIL', { style: 'failed', icon: 'cross' }],
  ['ERROR', { style: 'error', icon: 'error' }],
  ['WARN', { style: 'warning', icon: 'warning' }],
  ['release not recorded', { style: 'not-run', icon: 'circle' }],
  ['No evidence', { style: 'not-run', icon: 'dash' }],
  ['NOT_RUN', { style: 'not-run', icon: 'dash' }],
  ['Verified', { style: 'passed', icon: 'check' }],
  ['Unverified', { style: 'warning', icon: 'warning' }],
  ['Complete', { style: 'passed', icon: 'check' }],
  ['Incomplete', { style: 'warning', icon: 'warning' }],
  ['API key', { style: 'warning', icon: 'warning' }],
]);

export class StatusPill extends LitElement {
  static override properties = { status: { type: String } };

  static override styles = css`
    @layer components {
      .pill {
        display: inline-flex;
        font-size: var(--type-meta);
        line-height: var(--line-meta);
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
        <pb-icon name=${status?.icon ?? 'question'}></pb-icon>
        <span>${this.status}</span>
      </span>
    `;
  }
}

customElements.define('pb-status-pill', StatusPill);
