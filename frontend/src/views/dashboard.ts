import { css, html, nothing, type CSSResult, type LitElement, type PropertyValues } from 'lit';
import {
  activityKinds, activityLimit, attestationActivity, deploymentActivity, mergeActivity, releaseActivity,
  type ActivityEntry, type ActivityKind,
} from '../activity';
import {
  attestationPage, completedRuleSets, newestDeployments, newestReleases, repositoryOverview,
  type CompletedRuleSet, type RepositoryOverview,
} from '../api/client';
import '../components/pb-activity-feed';
import '../components/pb-empty-state';
import '../components/pb-icon';
import '../components/pb-needs-attention';
import '../components/pb-repository-map';
import '../components/pb-stat-tile';
import '../components/pb-relative-time';
import '../components/pb-widget';
import { healthStatuses, type RepositoryHealth } from '../repository-health';
import { CockpitView } from './cockpit-view';

interface DashboardData extends RepositoryOverview {
  setsByRepository: ReadonlyMap<string, CompletedRuleSet[]>;
  activity: ActivityEntry[];
  activityFailed: ActivityKind[];
}

const statuses = Object.keys(healthStatuses) as RepositoryHealth[];

export class DashboardView extends CockpitView<DashboardData> {
  static override properties = { search: { attribute: false } };

  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      :host { overflow-anchor: none; }

      .widgets, .widget-column {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        align-items: start;
        gap: var(--space-4);
      }

      .status-counts {
        display: flex;
        flex-wrap: wrap;
        align-items: start;
        gap: var(--space-1) var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .sync-stale {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
        padding: var(--space-1) var(--space-2);
        border-inline-start: var(--space-1) solid var(--status-warning);
      }

      @media (min-width: 56rem) {
        .widgets { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    }
  `];

  declare search: string;

  constructor() {
    super();
    this.search = '';
  }

  private readonly recent = new Map<ActivityKind, ActivityEntry[]>();

  protected override async read(signal: AbortSignal): Promise<DashboardData> {
    const [overview, completed, activity] = await Promise.all([
      repositoryOverview(signal),
      completedRuleSets(signal),
      this.readActivity(signal),
    ]);
    const setsByRepository = new Map(completed.map(({ repository, sets }) => [repository, sets]));
    return { ...overview, setsByRepository, ...activity };
  }

  /** A failed read keeps the entries of its kind from the last successful read. */
  private async readActivity(signal: AbortSignal) {
    const reads: Record<ActivityKind, () => Promise<ActivityEntry[]>> = {
      attestation: async () => (await attestationPage({ limit: activityLimit }, signal)).map(attestationActivity),
      release: async () => (await newestReleases(activityLimit, signal)).map(releaseActivity),
      deployment: async () => (await newestDeployments(activityLimit, signal)).map(deploymentActivity),
    };
    const failed = new Set<ActivityKind>();
    await Promise.all(activityKinds.map(async kind => {
      try {
        const entries = await reads[kind]();
        if (!signal.aborted) this.recent.set(kind, entries);
      } catch {
        failed.add(kind);
      }
    }));
    return {
      activity: mergeActivity([...this.recent.values()].flat()),
      activityFailed: activityKinds.filter(kind => failed.has(kind)),
    };
  }

  protected override heading() {
    return 'Dashboard';
  }

  protected override get headingVisible() { return false; }
  protected override readonly refreshable = true;

  private syncStatus({ completed_at, stale }: RepositoryOverview['heartbeat']) {
    if (!completed_at) return html`<div class="meta sync">The repository list has not been synced yet.</div>`;

    const age = html`Repository list synced <pb-relative-time .value=${completed_at}></pb-relative-time>`;
    if (!stale) return html`<div class="meta sync">${age}</div>`;

    return html`<div class="sync sync-stale">
      <pb-icon name="warning"></pb-icon>
      <div>
        <strong>Statuses may be outdated</strong>
        <div class="meta">${age} · stale</div>
      </div>
    </div>`;
  }

  protected override content(data?: DashboardData) {
    if (!data) return html``;
    const { repositories, setsByRepository, activity, activityFailed } = data;
    const requested = new URLSearchParams(this.search).get('status');
    const filter = statuses.find(status => status === requested);
    const clearFilter = filter ? { href: this.filterPath(), label: 'Clear status filter' } : undefined;
    const sync = this.syncStatus(data.heartbeat);
    const hasStaleSync = data.heartbeat.stale && Boolean(data.heartbeat.completed_at);
    const health = html`<pb-widget heading="Repository health" prominent>
      ${hasStaleSync ? sync : nothing}
      ${repositories.length ? html`<ul class="status-counts" role="list">
        ${statuses.map(status => html`<li><pb-stat-tile .status=${status}
          .repositories=${repositories} .active=${status === filter}
          .href=${this.filterPath(status)}></pb-stat-tile></li>`)}
      </ul>` : nothing}
      ${hasStaleSync ? nothing : sync}
    </pb-widget>`;

    if (repositories.length === 0) {
      return html`<div class="widget-column">
        ${health}
        <pb-empty-state heading="No repositories"
          message="The ledger has no repositories to show."></pb-empty-state>
      </div>`;
    }

    return html`
      <div class="widgets">
        <div class="widget-column">
          ${health}
          <pb-needs-attention .repositories=${repositories}></pb-needs-attention>
        </div>
        <div class="widget-column">
          <pb-activity-feed .entries=${activity} .failed=${activityFailed}></pb-activity-feed>
          <pb-repository-map .repositories=${repositories} .filter=${filter} .setsByRepository=${setsByRepository}
            .link=${clearFilter}></pb-repository-map>
        </div>
      </div>
    `;
  }

  private filterPath(status?: RepositoryHealth) {
    const params = new URLSearchParams(this.search);
    if (status) params.set('status', status);
    else params.delete('status');
    return params.size ? `/?${params}` : '/';
  }

  protected override update(changed: PropertyValues) {
    let focused = this.shadowRoot?.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    super.update(changed);
    if (focused instanceof HTMLElement) void this.restoreFocus(focused);
  }

  private async restoreFocus(focused: HTMLElement) {
    // The keyed lists update after the dashboard and may move a focused repository.
    const widgets = this.renderRoot.querySelectorAll<LitElement>('pb-stat-tile, pb-needs-attention, pb-activity-feed, pb-repository-map');
    await Promise.all(Array.from(widgets, widget => widget.updateComplete));
    if (!this.isConnected || document.activeElement !== document.body) return;
    const target = focused.isConnected ? focused : this.renderRoot.querySelector('h1');
    target?.focus({ preventScroll: true });
  }
}

customElements.define('pb-dashboard', DashboardView);
