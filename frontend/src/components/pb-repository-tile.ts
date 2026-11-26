import { css, html, LitElement, nothing } from 'lit';
import type { CompletedRuleSet, RepositoryOverviewEntry } from '../api/client';
import { repositoryHealth, stateLabels } from '../repository-health';
import { linkStyles } from '../styles/links';
import './pb-commit-link';
import './pb-relative-time';
import { releasePath, repositoryPath } from '../views/router';
import './pb-rule-set-chip';
import { ownerName } from './pb-short-name';
import './pb-status-pill';
import './pb-tooltip';

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
        padding: var(--panel-padding);
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
        font-size: var(--type-meta);
        line-height: var(--line-meta);
      }

      .identifiers {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: var(--space-2);
      }

      .identifiers pb-rule-set-chip {
        flex: none;
      }

      .repository {
        font-size: var(--type-section);
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

      pb-commit-link, pb-relative-time, pb-rule-set-chip, .release-link {
        position: relative;
        z-index: 1;
      }
    }
  `;

  declare entry?: RepositoryOverviewEntry;
  declare completedSets?: readonly CompletedRuleSet[];

  override render() {
    const { entry, completedSets } = this;
    if (!entry) return nothing;

    const {
      repository, state, status_token, latest_check: check, head, pending_since: pendingSince,
      latest_release: release, latest_deployment: deployment,
    } = entry;
    const owner = ownerName(repository);
    const path = repositoryPath(repository);
    const count = completedSets?.length ?? 0;
    const managedLabel = entry.managed ? nothing : ' · Not managed';

    return html`
      <div class="tile ${repositoryHealth(entry)}">
        ${owner || count ? html`<div class="identifiers">
          ${owner ? html`<span class="owner">${owner}</span>` : nothing}
          ${completedSets?.length ? html`<pb-rule-set-chip
            .label=${`${count} Rule ${count === 1 ? 'Set' : 'Sets'}`} .href=${path}
            .description=${completedSets.map(set => set.name).join(', ')}></pb-rule-set-chip>` : nothing}
        </div>` : nothing}
        <div class="title">
          <pb-tooltip external-trigger .description=${repository}>
            <a class="repository" data-route href=${path}>
              <pb-short-name .value=${repository}></pb-short-name>
            </a>
          </pb-tooltip>
          <pb-status-pill .status=${check?.overall ?? 'No evidence'}></pb-status-pill>
        </div>
        ${check ? html`<span class="meta">Reported <pb-commit-link .repository=${repository}
          .commit=${check.commit}></pb-commit-link> · <pb-relative-time .value=${check.received_at}></pb-relative-time></span>`
          : nothing}
        ${head && !head.direct_evidence && pendingSince && (state === 'pending' || state === 'overdue') ? html`
          <span class="meta ${status_token}">${stateLabels[state]}${state === 'overdue'
            ? html` (step ${entry.overdue_step} of ${entry.overdue_steps})` : nothing}
            · head <pb-commit-link .repository=${repository} .commit=${head.commit}></pb-commit-link>
            · awaiting evidence for <pb-relative-time duration .value=${pendingSince}></pb-relative-time>
            · ${entry.observed_heads_since_evidence} observed ${entry.observed_heads_since_evidence === 1 ? 'head' : 'heads'} since evidence${managedLabel}</span>`
          : html`<span class="meta">${stateLabels[state]}${managedLabel}</span>`}
        ${release || deployment ? html`<div class="meta facts">
          ${release ? html`Release <a class="release-link" data-route
            href=${releasePath(repository, release.version)}>${release.version}</a>` : nothing}
          ${release && deployment ? ' · ' : nothing}
          ${deployment ? html`${release ? nothing : 'Deployed to '}${deployment.name},
            <pb-relative-time .value=${deployment.received_at}></pb-relative-time>` : nothing}
        </div>` : nothing}
      </div>
    `;
  }
}

customElements.define('pb-repository-tile', RepositoryTile);
