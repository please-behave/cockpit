import { css, html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { CompletedRuleSet, RepositoryOverviewEntry } from '../api/client';
import { compareText, healthStatuses, repositoryHealth, type RepositoryHealth } from '../repository-health';
import './pb-repo-chip';
import { outcomeLabel } from './pb-status-pill';
import type { SectionLink } from './pb-section';
import { ownerName, shortName } from './pb-short-name';
import './pb-widget';

interface Organization {
  name: string;
  counts: Record<RepositoryHealth, number>;
  worstRank: number;
  matching: RepositoryOverviewEntry[];
}

const statuses = Object.keys(healthStatuses) as RepositoryHealth[];

function groupRepositories(repositories: readonly RepositoryOverviewEntry[], filter?: RepositoryHealth) {
  const groups = new Map<string, Organization>();
  for (const entry of repositories) {
    const name = ownerName(entry.repository);
    const health = repositoryHealth(entry);
    const { rank } = healthStatuses[health];
    let group = groups.get(name);
    if (!group) {
      group = { name, counts: { failed: 0, warning: 0, 'not-run': 0, passed: 0 }, worstRank: rank, matching: [] };
      groups.set(name, group);
    }
    group.counts[health]++;
    group.worstRank = Math.min(group.worstRank, rank);
    if (!filter || health === filter) group.matching.push(entry);
  }
  return groups;
}

function compareChips(left: RepositoryOverviewEntry, right: RepositoryOverviewEntry) {
  return healthStatuses[repositoryHealth(left)].rank - healthStatuses[repositoryHealth(right)].rank ||
    compareText(shortName(left.repository), shortName(right.repository)) ||
    compareText(left.platform ?? '', right.platform ?? '');
}

export class RepositoryMap extends LitElement {
  static override properties = {
    repositories: { attribute: false },
    setsByRepository: { attribute: false },
    link: { attribute: false },
    filter: { attribute: false },
  };

  static override styles = css`
    @layer components {
      .organizations, section {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }

      .organizations { gap: var(--space-4); }
      section { gap: var(--space-2); }

      .counts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1) var(--space-2);
      }

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

  declare link?: SectionLink;
  declare filter?: RepositoryHealth;
  declare repositories: readonly RepositoryOverviewEntry[];
  declare setsByRepository: ReadonlyMap<string, readonly CompletedRuleSet[]>;

  constructor() {
    super();
    this.repositories = [];
    this.setsByRepository = new Map();
  }

  override render() {
    const groups = groupRepositories(this.repositories, this.filter);
    const visible = [...groups.values()].filter(group => group.matching.length)
      .sort((left, right) => left.worstRank - right.worstRank || compareText(left.name, right.name));
    return html`
      <pb-widget heading="Repository map" .link=${this.link}>
        ${visible.length ? html`
          <div class="organizations">
            ${repeat(visible, group => group.name, group => html`
              <section>
                ${groups.size > 1 ? html`
                  <pb-section>
                    <h3 slot="heading">${group.name || 'No organization'}</h3>
                    <p slot="count" class="counts">
                      ${statuses.map(status => html`<span>${group.counts[status]} ${outcomeLabel(healthStatuses[status].outcome)}</span>`)}
                    </p>
                  </pb-section>
                ` : nothing}
                <ul role="list">
                  ${repeat(group.matching.sort(compareChips),
                    entry => JSON.stringify([entry.repository, entry.platform]), entry => html`
                      <li><pb-repo-chip .entry=${entry}
                        .completedSets=${this.setsByRepository.get(entry.repository)}></pb-repo-chip></li>
                    `)}
                </ul>
              </section>
            `)}
          </div>
        ` : html`<p>${this.filter ? 'No repositories match this status.' : 'No repositories'}</p>`}
      </pb-widget>
    `;
  }
}

customElements.define('pb-repository-map', RepositoryMap);
