import { css, html, LitElement } from 'lit';
import type { IconName } from './icons';
import './pb-icon';

const statuses = new Map<string, { style: string; icon: IconName; label?: string }>([
  ['PASS', { style: 'passed', icon: 'check', label: 'Pass' }],
  ['FAIL', { style: 'failed', icon: 'cross', label: 'Fail' }],
  ['ERROR', { style: 'error', icon: 'error', label: 'Error' }],
  ['WARN', { style: 'warning', icon: 'warning', label: 'Warn' }],
  ['release not recorded', { style: 'not-run', icon: 'circle', label: 'Release not recorded' }],
  ['No evidence', { style: 'not-run', icon: 'dash' }],
  ['NOT_RUN', { style: 'not-run', icon: 'circle', label: 'Not run' }],
  ['Verified', { style: 'passed', icon: 'check' }],
  ['Unverified', { style: 'warning', icon: 'warning' }],
  ['Complete', { style: 'passed', icon: 'check' }],
  ['Incomplete', { style: 'warning', icon: 'warning' }],
  ['Repository not compliant', { style: 'warning', icon: 'warning' }],
  ['API key', { style: 'warning', icon: 'warning' }],
]);

export function outcomeLabel(status: string) {
  return statuses.get(status)?.label ?? status;
}

export class StatusPill extends LitElement {
  static override properties = {
    status: { type: String },
  };

  static override styles = css`
    @layer components {
      :host { flex-shrink: 0; }

      .pill {
        cursor: pointer;
        user-select: none;
        display: inline-flex;
        font-size: var(--type-meta);
        line-height: var(--line-meta);
        max-inline-size: 100%;
        box-sizing: border-box;
        align-items: baseline;
        gap: var(--space-1);
        color: var(--text-muted);
        font-weight: var(--weight-semibold);
        white-space: nowrap;
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
        <span>${outcomeLabel(this.status)}</span>
      </span>
    `;
  }
}

customElements.define('pb-status-pill', StatusPill);
