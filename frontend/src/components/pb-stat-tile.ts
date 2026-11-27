import { css, html, LitElement, nothing } from 'lit';
import type { RepositoryOverviewEntry } from '../api/client';
import { healthStatuses, repositoryHealth, type RepositoryHealth } from '../repository-health';
import { linkStyles } from '../styles/links';
import './pb-icon';
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
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-2);
        min-block-size: var(--target-min-size);
        padding: var(--control-padding-block) var(--control-padding-inline);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface-raised);
        font-size: var(--type-data);
        line-height: var(--line-data);
      }

      a.tile { cursor: pointer; }
      a:hover { background: var(--surface-hover); }

      @media (forced-colors: active) {
        a:hover:not(:focus-visible) {
          outline: 1px solid var(--border);
          outline-offset: -1px;
        }
      }
      .empty { color: var(--text-muted); }
      .active {
        border-color: currentColor;
        border-inline-start-width: 3px;
      }
      .active-label {
        flex-basis: 100%;
        font-size: var(--type-meta);
      }

      .count { font-weight: var(--weight-semibold); }
      .passed { color: var(--status-passed); }
      .failed { color: var(--status-failed); }
      .warning { color: var(--status-warning); }
      .not-run { color: var(--status-not-run); }
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
    const content = html`
      <pb-icon class=${count ? this.status : nothing} name=${status.icon}></pb-icon>
      <span class="count">${count}</span> <span>${status.label}</span>
      ${this.active ? html`<span class="active-label">Current filter</span>` : nothing}
    `;
    const noun = count === 1 ? 'repository' : 'repositories';
    const name = this.status === 'warning'
      ? `${count} ${noun} with ${count === 1 ? 'a warning' : 'warnings'}`
      : `${count} ${status.label} ${noun}`;
    const link = html`
      <a class="tile ${count === 0 ? 'empty' : ''} ${this.active ? 'active' : ''}"
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
