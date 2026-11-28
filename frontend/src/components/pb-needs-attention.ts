import { css, html, LitElement } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { linkStyles } from '../styles/links';
import type { RepositoryOverviewEntry } from '../api/client';
import { compareBySeverity, healthStatuses, repositoryHealth, stateLabels } from '../repository-health';
import { textStyles } from '../styles/text';
import './pb-commit-link';
import './pb-relative-time';
import { repositoryReference, repositoryReferenceStyles } from './repository-reference';
import './pb-status-pill';
import './pb-widget';

function attentionReason(entry: RepositoryOverviewEntry) {
  const { state, latest_check: check } = entry;
  if (state === 'unknown') return 'Evidence status unknown';
  if (state === 'never_integrated') return stateLabels[state];
  if (check?.overall === 'FAIL' || check?.overall === 'ERROR') {
    return html`<pb-commit-link .repository=${entry.repository} .commit=${check.commit}></pb-commit-link> · Reported <pb-relative-time
      .value=${check.received_at}></pb-relative-time>`;
  }
  return html`${stateLabels.overdue} (step ${entry.overdue_step} of ${entry.overdue_steps})`;
}

export class NeedsAttention extends LitElement {
  static override properties = { repositories: { attribute: false } };

  static override styles = [linkStyles, repositoryReferenceStyles, textStyles, css`
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

      p { margin: 0; }

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
              const verdict = entry.latest_check?.overall;
              const outcome = entry.state !== 'unknown' && entry.state !== 'never_integrated'
                && (verdict === 'ERROR' || verdict === 'FAIL') ? verdict : healthStatuses[health].outcome;
              return html`
                <li>
                  <div class="title">
                    <pb-status-pill .status=${outcome}></pb-status-pill> ·
                    ${repositoryReference(repository)}
                  </div>
                  <p class="reason meta">${attentionReason(entry)}</p>
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
