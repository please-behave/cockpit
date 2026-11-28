import { css, html, LitElement, nothing } from 'lit';
import type { RepositoryOverviewEntry } from '../api/client';
import { healthStatuses, repositoryHealth, type RepositoryHealth } from '../repository-health';
import { linkStyles } from '../styles/links';
import './pb-icon';
import { outcomeLabel } from './pb-status-pill';
import './pb-tooltip';

const previewLimit = 3;

export class StatTile extends LitElement {
  static override properties = {
    status: { type: String },
    href: { type: String },
    repositories: { attribute: false },
    active: { type: Boolean },
  };

  static override styles = [linkStyles, css`
    @layer components {
      :host, pb-tooltip {
        display: block;
      }

      .tile {
        box-sizing: border-box;
        display: grid;
        align-content: center;
        min-block-size: var(--target-min-size);
        padding: var(--control-padding-block) var(--space-1);
        cursor: pointer;
        font-size: var(--type-data);
        line-height: var(--line-data);
        text-decoration: none;
      }

      .outcome {
        display: flex;
        align-items: baseline;
        gap: var(--space-1);
        white-space: nowrap;
      }
      .tile:hover .outcome-label, .tile[aria-current] .outcome-label {
        text-decoration: underline;
      }

      .active-label {
        color: var(--text-muted);
        font-size: var(--type-meta);
      }

      .count { font-weight: var(--weight-semibold); }
      .failed { color: var(--status-failed); }
      .warning { color: var(--status-warning); }
      .not-run { color: var(--status-not-run); }
      .muted { color: var(--text-muted); }
      .muted .count { font-weight: inherit; }
    }
  `];

  declare status: RepositoryHealth;
  declare href?: string;
  declare repositories: readonly RepositoryOverviewEntry[];
  declare active: boolean;

  constructor() {
    super();
    this.status = 'failed';
    this.repositories = [];
    this.active = false;
  }

  override render() {
    const status = healthStatuses[this.status];
    const matching = this.repositories.filter(entry => repositoryHealth(entry) === this.status);
    const count = matching.length;
    const label = outcomeLabel(status.outcome);
    const muted = count === 0 || this.status === 'passed';
    const content = html`
      <span class="outcome ${muted ? 'muted' : this.status}">
        <pb-icon name=${status.icon}></pb-icon>
        <span class="outcome-label"><span class="count">${count}</span> ${label}</span>
      </span>
      ${this.active ? html`<span class="active-label">Current filter</span>` : nothing}
    `;
    const name = `${count} ${label}`;
    const link = html`
      <a class="tile"
        data-route href=${this.href ?? `/?status=${this.status}`}
        aria-label=${name} aria-current=${this.active ? 'true' : nothing}
        aria-describedby=${count ? 'preview' : nothing}>${content}</a>
    `;
    if (count === 0) return link;

    const names = matching.slice(0, previewLimit).map(entry => entry.repository).join(', ');
    const remaining = count - previewLimit;
    const preview = remaining > 0 ? `${names} and ${remaining} more` : names;
    return html`
      <pb-tooltip external-trigger .description=${preview}>
        ${link}
      </pb-tooltip>
      <span id="preview" hidden>${preview}</span>
    `;
  }
}

customElements.define('pb-stat-tile', StatTile);
