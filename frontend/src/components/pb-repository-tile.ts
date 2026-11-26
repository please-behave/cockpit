import { css, html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { CompletedRuleSet, RepositoryOverviewEntry } from '../api/client';
import { linkStyles } from '../styles/links';
import './pb-commit-link';
import './pb-relative-time';
import { repositoryPath, ruleSetPath } from '../views/router';
import './pb-rule-set-chip';
import { ownerName } from './pb-short-name';
import './pb-status-pill';
import './pb-tooltip';

export type RepositoryHealth = 'passed' | 'warning' | 'failed' | 'not-run';

export function repositoryHealth(entry: RepositoryOverviewEntry): RepositoryHealth {
  if (entry.state === 'unknown') return 'not-run';
  if (entry.state === 'never_integrated' || entry.latest_check?.overall === 'FAIL' ||
      entry.latest_check?.overall === 'ERROR') return 'failed';
  if (entry.state === 'overdue') {
    return entry.overdue_step === entry.overdue_steps ? 'failed' : 'warning';
  }
  return 'passed';
}

const stateLabels = {
  current: 'Current',
  pending: 'Pending',
  overdue: 'Overdue',
  never_integrated: 'Never integrated',
  unknown: 'Unknown',
};

export class RepositoryTile extends LitElement {
  static override properties = {
    entry: { attribute: false },
    completedSets: { attribute: false },
  };

  static override styles = css`
    ${linkStyles}

    @layer components {
      :host {
        display: grid;
        min-inline-size: 0;
        grid-template-columns: minmax(0, 1fr);
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
      .tile.warning { border-block-start-color: var(--status-warning); }
      .tile.not-run { border-block-start-color: var(--status-not-run); }
      .meta.status-allowed { color: var(--status-allowed); }
      .meta.status-warning { color: var(--status-warning); }

      .title {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: var(--space-1) var(--space-2);
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

      pb-commit-link, pb-relative-time, pb-rule-set-chip {
        position: relative;
        z-index: 1;
      }

      .sets {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin: var(--space-1) 0 0;
        padding: 0;
        list-style: none;
      }

      .sets li {
        min-inline-size: 0;
        max-inline-size: 100%;
      }
    }
  `;

  declare entry?: RepositoryOverviewEntry;
  declare completedSets?: readonly CompletedRuleSet[];

  override render() {
    const { entry, completedSets } = this;
    if (!entry) return nothing;

    const { repository, state, status_token, latest_check: check, head, pending_since: pendingSince } = entry;
    const owner = ownerName(repository);

    return html`
      <div class="tile ${repositoryHealth(entry)}">
        ${owner ? html`<span class="owner">${owner}</span>` : nothing}
        <div class="title">
          <pb-tooltip external-trigger .description=${repository}>
            <a class="repository" data-route href=${repositoryPath(repository)}>
              <pb-short-name .value=${repository}></pb-short-name>
            </a>
          </pb-tooltip>
          <pb-status-pill .status=${check?.overall ?? 'No evidence'}></pb-status-pill>
        </div>
        ${!entry.managed ? html`<span class="meta">Not managed</span>` : nothing}
        ${check ? html`<span class="meta">Reported <pb-commit-link .repository=${repository}
          .commit=${check.commit}></pb-commit-link> · <pb-relative-time .value=${check.received_at}></pb-relative-time></span>`
          : nothing}
        ${head && !head.direct_evidence && pendingSince && (state === 'pending' || state === 'overdue') ? html`
          <span class="meta ${status_token}">${stateLabels[state]}${state === 'overdue'
            ? html` (step ${entry.overdue_step} of ${entry.overdue_steps})` : nothing}
            · head <pb-commit-link .repository=${repository} .commit=${head.commit}></pb-commit-link>
            · awaiting evidence for <pb-relative-time duration .value=${pendingSince}></pb-relative-time>
            · ${entry.observed_heads_since_evidence} observed ${entry.observed_heads_since_evidence === 1 ? 'head' : 'heads'} since evidence</span>`
          : html`<span class="meta">${stateLabels[state]}</span>`}
        ${completedSets?.length ? html`
          <ul class="sets" role="list" aria-label="Completed Rule Sets">
            ${repeat(completedSets, set => JSON.stringify([set.source, set.path, set.id, set.version]), set => html`
              <li><pb-rule-set-chip .label=${set.name} .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip></li>
            `)}
          </ul>
        ` : nothing}
      </div>
    `;
  }
}

customElements.define('pb-repository-tile', RepositoryTile);
