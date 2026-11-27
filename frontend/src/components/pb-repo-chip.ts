import { css, html, LitElement, nothing } from 'lit';
import type { CompletedRuleSet, RepositoryOverviewEntry } from '../api/client';
import { healthStatuses, repositoryHealth } from '../repository-health';
import { linkStyles } from '../styles/links';
import { repositoryPath } from '../views/router';
import { ownerName, shortName } from './pb-short-name';
import { completedRuleSetChips, ruleSetListStyles } from './pb-rule-set-summary';
import { repositoryEvidence, repositorySummaryStyles, repositoryVerdict } from './repository-summary';
import './pb-icon';
import './pb-tooltip';

export class RepoChip extends LitElement {
  static override properties = {
    entry: { attribute: false },
    completedSets: { attribute: false },
  };

  static override styles = [linkStyles, repositorySummaryStyles, ruleSetListStyles, css`
    @layer components {
      :host {
        display: block;
        min-inline-size: 0;
        max-inline-size: 100%;
      }

      .chip {
        box-sizing: border-box;
        display: inline-flex;
        align-items: baseline;
        gap: var(--space-2);
        padding: var(--control-padding-block) var(--control-padding-inline);
        border: 1px solid var(--border);
        border-radius: var(--radius-pill);
        background: var(--surface-raised);
        text-decoration: none;
      }

      .chip:hover { background: var(--surface-hover); }
      .short {
        min-inline-size: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-decoration: underline;
        text-underline-offset: 0.15em;
      }

      .failed { color: var(--status-failed); }
      .warning { color: var(--status-warning); }
      .not-run { color: var(--status-not-run); }
      .passed { color: var(--status-passed); }

      .preview {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
      }

      .preview-name { font-weight: var(--weight-semibold); }
      .health { text-transform: capitalize; }
    }
  `];

  declare entry?: RepositoryOverviewEntry;
  declare completedSets?: readonly CompletedRuleSet[];

  override render() {
    const { entry, completedSets } = this;
    if (!entry) return nothing;

    const { repository } = entry;
    const health = repositoryHealth(entry);
    const { icon, label } = healthStatuses[health];
    const name = `${repository}, ${label}`;
    const owner = ownerName(repository);

    return html`
      <pb-tooltip external-trigger interactive .description=${name}>
        <a class="chip" data-route href=${repositoryPath(repository)} aria-label=${name}>
          <pb-icon class=${health} name=${icon}></pb-icon>
          <span class="short">${shortName(repository)}</span>
        </a>
        <div class="preview" slot="preview">
          <span class="preview-name">${repository}</span>
          ${owner ? html`<span class="owner">${owner}</span>` : nothing}
          <span class="health ${health}"><pb-icon name=${icon}></pb-icon> ${label}</span>
          ${completedRuleSetChips(completedSets ?? [])}
          <div>${repositoryVerdict(entry)}</div>
          ${repositoryEvidence(entry)}
        </div>
      </pb-tooltip>
    `;
  }
}

customElements.define('pb-repo-chip', RepoChip);
