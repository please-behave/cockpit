import { css, html, LitElement, nothing } from 'lit';
import type { Summary } from '../api/client';
import { commitUrl } from '../commit-link';
import { linkStyles } from '../styles/links';
import './pb-relative-time';
import { ownerName } from './pb-short-name';
import './pb-status-pill';

function plural(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export class RepositoryTile extends LitElement {
  static override properties = {
    summary: { attribute: false },
    showExecutionPoints: { type: Boolean },
  };

  static override styles = css`
    ${linkStyles}

    @layer components {
      :host {
        display: grid;
      }

      .tile {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-4);
        border: 1px solid var(--border);
        border-block-start: 0.25rem solid var(--border);
        border-radius: var(--radius-panel);
        background: var(--surface-raised);
        overflow-wrap: anywhere;
      }

      .tile.passed { border-block-start-color: var(--status-passed); }
      .tile.failed { border-block-start-color: var(--status-failed); }
      .tile.error { border-block-start-color: var(--status-error); }

      .tile pb-status-pill {
        align-self: flex-start;
        font-size: var(--type-brand);
      }

      .owner, .meta {
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      .owner {
        display: block;
      }

      .repository {
        font-size: var(--type-brand);
        font-weight: var(--weight-semibold);
      }

      .repository::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: var(--radius-panel);
      }

      .repository:focus-visible {
        outline: none;
      }

      .repository:focus-visible::after {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }

      .commit {
        position: relative;
        z-index: 1;
      }

      .commit:focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }

      .assistive {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }
  `;

  declare summary?: Summary;
  declare showExecutionPoints: boolean;

  constructor() {
    super();
    this.showExecutionPoints = false;
  }

  override render() {
    const { summary, showExecutionPoints } = this;
    if (!summary) return nothing;

    const owner = ownerName(summary.repository);
    const style = { PASS: 'passed', FAIL: 'failed', ERROR: 'error' }[summary.overall] ?? '';
    const commit = Array.from(summary.commit).slice(0, 7).join('');
    const url = commitUrl(summary.repository, summary.commit);

    return html`
      <div class="tile ${style}">
        <pb-status-pill .status=${summary.overall}></pb-status-pill>
        <div>
          ${owner ? html`<span class="owner">${owner}</span>` : nothing}
          <a class="repository" data-route href=${`/attestations/${encodeURIComponent(summary.id)}`}>
            <pb-short-name .value=${summary.repository}></pb-short-name>
          </a>
        </div>
        ${showExecutionPoints
          ? html`<span class="meta">${summary.execution_points.join(', ') || 'no execution points'}</span>`
          : nothing}
        <span class="meta">${url
          ? html`<a class="commit" href=${url} target="_blank" rel="noopener noreferrer"><code>${commit}</code>
            <span aria-hidden="true">↗</span><span class="assistive">(opens in a new tab)</span></a>`
          : html`<code>${commit}</code>`}</span>
        <span class="meta">Reported <pb-relative-time .value=${summary.received_at}></pb-relative-time></span>
        <span class="meta">${plural(summary.result_count, 'rule')} · ${plural(summary.warn_count, 'warning')} · ${summary.not_run_count} not run</span>
      </div>
    `;
  }
}

customElements.define('pb-repository-tile', RepositoryTile);
