import { css, html, LitElement } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { CompletedRuleSet, RepositoryOverviewEntry } from '../api/client';
import { compareBySeverity } from '../repository-health';
import './pb-repo-chip';
import './pb-widget';

export class RepositoryMap extends LitElement {
  static override properties = {
    repositories: { attribute: false },
    setsByRepository: { attribute: false },
  };

  static override styles = css`
    @layer components {
      ul {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li {
        min-inline-size: 0;
        max-inline-size: min(100%, 16rem);
      }

      p { margin: 0; }
    }
  `;

  declare repositories: readonly RepositoryOverviewEntry[];
  declare setsByRepository: ReadonlyMap<string, readonly CompletedRuleSet[]>;

  constructor() {
    super();
    this.repositories = [];
    this.setsByRepository = new Map();
  }

  override render() {
    const sorted = [...this.repositories].sort(compareBySeverity);
    return html`
      <pb-widget heading="Repository map">
        ${sorted.length ? html`
          <ul role="list">
            ${repeat(sorted, entry => JSON.stringify([entry.repository, entry.platform]), entry => html`
              <li><pb-repo-chip .entry=${entry}
                .completedSets=${this.setsByRepository.get(entry.repository)}></pb-repo-chip></li>
            `)}
          </ul>
        ` : html`<p>No repositories</p>`}
      </pb-widget>
    `;
  }
}

customElements.define('pb-repository-map', RepositoryMap);
