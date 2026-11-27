import { css, html, LitElement } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { RepositoryOverviewEntry } from '../api/client';
import { compareBySeverity, healthStatuses, repositoryHealth, stateLabels } from '../repository-health';
import { linkStyles } from '../styles/links';
import { repositoryPath } from '../views/router';
import { shortName } from './pb-short-name';
import './pb-commit-link';
import './pb-icon';
import './pb-relative-time';
import './pb-tooltip';
import './pb-widget';

function attentionReason(entry: RepositoryOverviewEntry) {
  const { state, latest_check: check } = entry;
  if (state === 'unknown') return 'Evidence status unknown';
  if (state === 'never_integrated') return stateLabels[state];
  if (check?.overall === 'FAIL' || check?.overall === 'ERROR') {
    return html`${check.overall} · <pb-commit-link .repository=${entry.repository}
      .commit=${check.commit}></pb-commit-link> · Reported <pb-relative-time
      .value=${check.received_at}></pb-relative-time>`;
  }
  return html`${stateLabels.overdue} (step ${entry.overdue_step} of ${entry.overdue_steps})`;
}

export class NeedsAttention extends LitElement {
  static override properties = { repositories: { attribute: false } };

  static override styles = [linkStyles, css`
    @layer components {
      ul {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li + li {
        border-block-start: 1px solid var(--border-subtle);
        padding-block-start: var(--space-2);
      }

      .title {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }

      .title pb-tooltip { min-inline-size: 0; }

      .status {
        display: inline-flex;
        flex: none;
        align-items: baseline;
        gap: var(--space-1);
        font-weight: var(--weight-semibold);
        text-transform: capitalize;
      }

      .failed { color: var(--status-failed); }
      .warning { color: var(--status-warning); }
      .not-run { color: var(--status-not-run); }

      .repository {
        vertical-align: middle;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      p { margin: 0; }

      .reason {
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
      }
    }
  `];

  declare repositories: readonly RepositoryOverviewEntry[];

  constructor() {
    super();
    this.repositories = [];
  }

  override render() {
    const attention = this.repositories.filter(entry => repositoryHealth(entry) !== 'passed').sort(compareBySeverity);
    const count = this.repositories.length;
    return html`
      <pb-widget heading="Needs attention">
        ${attention.length ? html`
          <ul role="list">
            ${repeat(attention, entry => JSON.stringify([entry.repository, entry.platform]), entry => {
              const { repository } = entry;
              const health = repositoryHealth(entry);
              const { icon, label } = healthStatuses[health];
              return html`
                <li>
                  <div class="title">
                    <span class="status ${health}"><pb-icon name=${icon}></pb-icon> ${label}</span>
                    <pb-tooltip external-trigger .description=${repository}>
                      <a class="repository" data-route href=${repositoryPath(repository)}
                        aria-label=${repository}>${shortName(repository)}</a>
                    </pb-tooltip>
                  </div>
                  <p class="reason">${attentionReason(entry)}</p>
                </li>
              `;
            })}
          </ul>
        ` : html`
          <p>No repositories need attention. ${count} ${count === 1 ? 'repository' : 'repositories'} checked.</p>
        `}
      </pb-widget>
    `;
  }
}

customElements.define('pb-needs-attention', NeedsAttention);
