import { css, html, LitElement, nothing } from 'lit';
import type { CompletedRuleSet, RepositoryOverviewEntry } from '../api/client';
import { healthStatuses, repositoryHealth } from '../repository-health';
import { linkStyles } from '../styles/links';
import { completedRuleSetChips, ruleSetListStyles } from './pb-rule-set-summary';
import { repositoryEvidence, repositorySummaryStyles, repositoryVerdict } from './repository-summary';
import { repositoryReference, repositoryReferenceStyles } from './repository-reference';
import './pb-status-pill';

export class RepoChip extends LitElement {
  static override properties = {
    entry: { attribute: false },
    completedSets: { attribute: false },
  };

  static override styles = [repositoryReferenceStyles, linkStyles, repositorySummaryStyles, ruleSetListStyles, css`
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
        max-inline-size: 100%;
        gap: var(--space-2);
        padding: var(--control-padding-block) var(--control-padding-inline);
        border: 1px solid var(--border);
        border-radius: var(--radius-pill);
        background: var(--surface-raised);
      }

      .chip:hover { background: var(--surface-hover); }
      .chip > pb-status-pill { flex: none; }

      .preview-name { font-weight: var(--weight-semibold); }

      .preview {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
      }
    }
  `];

  declare entry?: RepositoryOverviewEntry;
  declare completedSets?: readonly CompletedRuleSet[];

  override render() {
    const { entry, completedSets } = this;
    if (!entry) return nothing;

    const { repository } = entry;
    const health = repositoryHealth(entry);
    const { outcome } = healthStatuses[health];

    return html`
      <span class="chip">
        <pb-status-pill .status=${outcome}></pb-status-pill>
        ${repositoryReference(repository, html`
          <div class="preview" slot="preview">
            <span class="preview-name">${repository}</span>
            ${completedRuleSetChips(completedSets ?? [])}
            ${entry.latest_check?.overall === outcome ? nothing : html`<div>${repositoryVerdict(entry)}</div>`}
            ${repositoryEvidence(entry)}
          </div>
        `)}
      </span>
    `;
  }
}

customElements.define('pb-repo-chip', RepoChip);
