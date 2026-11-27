import { css, html, nothing, type CSSResult, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import {
  completedRuleSets, repositoryOverview, type CompletedRuleSet, type RepositoryOverview, type RepositoryOverviewEntry,
} from '../api/client';
import '../components/pb-empty-state';
import '../components/pb-icon';
import '../components/pb-repository-tile';
import '../components/pb-time';
import { compareByName, compareBySeverity, healthStatuses, repositoryHealth, type RepositoryHealth } from '../repository-health';
import { CockpitView } from './cockpit-view';

type Sort = 'severity' | 'time' | 'name';

interface DashboardData extends RepositoryOverview {
  setsByRepository: ReadonlyMap<string, CompletedRuleSet[]>;
}

const sortOptions: readonly { value: Sort; label: string }[] = [
  { value: 'severity', label: 'Severity' },
  { value: 'time', label: 'Last attestation' },
  { value: 'name', label: 'Name' },
];

function receivedAt(entry: RepositoryOverviewEntry): number {
  const time = Date.parse(entry.latest_check?.received_at ?? '');
  return Number.isNaN(time) ? -Infinity : time;
}

function compareByTime(left: RepositoryOverviewEntry, right: RepositoryOverviewEntry): number {
  const leftTime = receivedAt(left);
  const rightTime = receivedAt(right);
  if (leftTime === rightTime) return compareByName(left, right);
  return leftTime < rightTime ? 1 : -1;
}

const comparators = { severity: compareBySeverity, time: compareByTime, name: compareByName };

function sortFromLocation(): Sort {
  const sort = new URLSearchParams(window.location.search).get('sort');
  return sort === 'name' || sort === 'time' ? sort : 'severity';
}

function tileKey(entry: RepositoryOverviewEntry) {
  return JSON.stringify([entry.repository, entry.platform]);
}

export class DashboardView extends CockpitView<DashboardData> {
  static override properties = { sort: { state: true } };

  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      .banner {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-4);
        margin-block-end: var(--space-6);
        padding: var(--panel-padding) var(--space-6);
        border: 1px solid var(--panel-border);
        border-inline-start: 0.5rem solid var(--border);
        border-radius: var(--radius-panel);
        background: var(--panel-surface);
      }

      .banner.passed { border-inline-start-color: var(--status-passed); }
      .banner.failed { border-inline-start-color: var(--status-failed); }
      .banner.warning { border-inline-start-color: var(--status-warning); }
      .banner.not-run { border-inline-start-color: var(--status-not-run); }

      .counts {
        display: flex;
        flex-wrap: wrap;
        column-gap: var(--space-4);
        row-gap: var(--space-1);
        margin: 0;
        padding: 0;
        list-style: none;
        font-size: var(--type-heading);
        line-height: var(--line-heading);
        font-weight: var(--weight-semibold);
      }

      .counts pb-icon { vertical-align: middle; }
      .counts .passed { color: var(--status-passed); }
      .counts .failed { color: var(--status-failed); }
      .counts .warning { color: var(--status-warning); }
      .counts .not-run { color: var(--status-not-run); }

      .sync {
        flex-basis: 100%;
        margin: 0;
        color: var(--text-muted);
        overflow-wrap: anywhere;
      }

      .sort {
        margin: 0;
        margin-inline-start: auto;
        min-inline-size: 0;
        padding: 0;
        border: 0;
        text-align: end;
      }

      .sort legend {
        float: inline-start;
        padding: 0;
        margin-inline-end: var(--space-3);
      }

      .sort label {
        display: inline-block;
        min-inline-size: var(--target-min-size);
        line-height: max(var(--target-min-size), 1em * var(--line-data));
      }

      .sort label + label {
        margin-inline-start: var(--space-3);
      }

      @media (max-width: 24rem) {
        .sort legend {
          float: none;
          margin-inline: auto 0;
          margin-block-end: var(--space-1);
        }
      }

      .tiles {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
        gap: var(--space-4);
      }

      .tiles > li {
        display: grid;
      }
    }
  `];

  declare sort: Sort;

  constructor() {
    super();
    this.sort = sortFromLocation();
  }

  protected override async read(signal: AbortSignal): Promise<DashboardData> {
    const [overview, completed] = await Promise.all([
      repositoryOverview(signal),
      completedRuleSets(signal),
    ]);
    const setsByRepository = new Map(completed.map(({ repository, sets }) => [repository, sets]));
    return { ...overview, setsByRepository };
  }

  protected override heading() {
    return 'Dashboard';
  }

  protected override get headingVisible() { return false; }
  protected override readonly refreshable = true;

  protected override content(data?: DashboardData) {
    return html`${data === undefined ? nothing : this.results(data)}`;
  }

  protected override update(changed: PropertyValues) {
    // Lit can move a tile when its health changes. Keep focus on the same control.
    let focused = this.shadowRoot?.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    super.update(changed);
    if (focused instanceof HTMLElement && focused.isConnected && !this.shadowRoot?.activeElement) {
      focused.focus({ preventScroll: true });
    }
  }

  private changeSort(event: Event) {
    this.sort = (event.target as HTMLInputElement).value as Sort;
    const url = new URL(window.location.href);
    if (this.sort === 'severity') url.searchParams.delete('sort');
    else url.searchParams.set('sort', this.sort);
    window.history.replaceState(window.history.state, '', url);
  }

  private results({ heartbeat, repositories, setsByRepository }: DashboardData) {
    if (repositories.length === 0) {
      return html`<pb-empty-state heading="No repositories"
        message="The ledger has no repositories to show."></pb-empty-state>`;
    }

    const counts: Record<RepositoryHealth, number> = { failed: 0, warning: 0, 'not-run': 0, passed: 0 };
    for (const entry of repositories) counts[repositoryHealth(entry)]++;
    const healthEntries = Object.entries(healthStatuses) as [RepositoryHealth, typeof healthStatuses[RepositoryHealth]][];
    const severity = healthEntries.find(([health]) => counts[health] > 0)?.[0];
    const sorted = [...repositories].sort(comparators[this.sort]);

    return html`
      <div class="banner ${severity}">
        <ul class="counts" aria-label="Repository health" role="list">
          ${healthEntries.map(([health, { icon, label }]) => html`<li class=${health}>
            <pb-icon name=${icon}></pb-icon> ${counts[health]} ${label}
          </li>`)}
        </ul>
        <fieldset class="sort">
          <legend>Sort by</legend>
          ${sortOptions.map(option => html`<label><input type="radio" name="sort" .value=${option.value}
            ?checked=${this.sort === option.value} @change=${this.changeSort}> ${option.label}</label>`)}
        </fieldset>
        <p class="sync">${heartbeat.completed_at
          ? html`Oldest covering sync <pb-time .value=${heartbeat.completed_at}></pb-time>${heartbeat.stale ? ' (stale)' : ''}`
          : 'No covering sync has completed.'}</p>
      </div>
      <ul class="tiles" aria-label="Repositories" role="list">
        ${repeat(sorted, tileKey, entry => html`
          <li><pb-repository-tile .entry=${entry}
            .completedSets=${setsByRepository.get(entry.repository)}></pb-repository-tile></li>
        `)}
      </ul>
    `;
  }
}

customElements.define('pb-dashboard', DashboardView);
