import { css, html, LitElement, nothing } from 'lit';
import type { CompletedRuleSet, RepositoryOverviewEntry } from '../api/client';
import { repositoryHealth } from '../repository-health';
import { linkStyles } from '../styles/links';
import { repositoryPath } from '../views/router';
import { repositoryEvidence, repositoryIdentifiers, repositorySummaryStyles, repositoryVerdict } from './repository-summary';
import './pb-tooltip';

export class RepositoryTile extends LitElement {
  static override properties = {
    entry: { attribute: false },
    completedSets: { attribute: false },
  };

  static override styles = css`
    ${linkStyles}
    ${repositorySummaryStyles}

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
      .title {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: start;
        gap: var(--space-1) var(--space-2);
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

    const { repository } = entry;
    const path = repositoryPath(repository);

    return html`
      <div class="tile ${repositoryHealth(entry)}">
        ${repositoryIdentifiers(repository, completedSets)}
        <div class="title">
          <pb-tooltip external-trigger .description=${repository}>
            <a class="repository" data-route href=${path}>
              <pb-short-name .value=${repository}></pb-short-name>
            </a>
          </pb-tooltip>
          ${repositoryVerdict(entry)}
        </div>
        ${repositoryEvidence(entry)}
      </div>
    `;
  }
}

customElements.define('pb-repository-tile', RepositoryTile);
