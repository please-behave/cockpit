import { css, html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { CompletedRuleSet, Summary } from '../api/client';
import { linkStyles } from '../styles/links';
import './pb-commit-link';
import './pb-relative-time';
import { repositoryPath, ruleSetPath } from '../views/router';
import './pb-rule-set-chip';
import { ownerName } from './pb-short-name';
import './pb-status-pill';
import './pb-tooltip';

export class RepositoryTile extends LitElement {
  static override properties = {
    summary: { attribute: false },
      completedSets: { attribute: false },
    showExecutionPoints: { type: Boolean },
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

      pb-commit-link, pb-relative-time, pb-rule-set-chip, .repository-page {
        position: relative;
        z-index: 1;
      }

      .repository-page { align-self: flex-start; }

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

  declare summary?: Summary;
  declare completedSets?: readonly CompletedRuleSet[];
  declare showExecutionPoints: boolean;

  constructor() {
    super();
    this.showExecutionPoints = false;
  }

  override render() {
      const { summary, showExecutionPoints, completedSets } = this;
    if (!summary) return nothing;

    const owner = ownerName(summary.repository);
    const style = { PASS: 'passed', FAIL: 'failed', ERROR: 'error' }[summary.overall] ?? '';

    return html`
      <div class="tile ${style}">
        <pb-status-pill .status=${summary.overall}></pb-status-pill>
        <div>
          ${owner ? html`<span class="owner">${owner}</span>` : nothing}
          <pb-tooltip external-trigger .description=${summary.repository}>
            <a class="repository" data-route href=${`/attestations/${encodeURIComponent(summary.id)}`}>
              <pb-short-name .value=${summary.repository}></pb-short-name>
            </a>
          </pb-tooltip>
        </div>
        ${showExecutionPoints
          ? html`<span class="meta">${summary.execution_points.join(', ') || 'no execution points'}</span>`
          : nothing}
        <span class="meta"><pb-commit-link .repository=${summary.repository}
          .commit=${summary.commit}></pb-commit-link></span>
        <span class="meta">Reported <pb-relative-time .value=${summary.received_at}></pb-relative-time> · ${summary.result_count} ${summary.result_count === 1 ? 'rule' : 'rules'}</span>
        <a class="repository-page" data-route href=${repositoryPath(summary.repository)}
          aria-label=${`View repository ${summary.repository}`}>View repository</a>
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
