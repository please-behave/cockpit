import { css, html, nothing, type CSSResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { latestAttestations, type Summary } from '../api/client';
import '../components/pb-empty-state';
import '../components/pb-repository-tile';
import { CockpitView } from './cockpit-view';

type Sort = 'time' | 'name';

const sortOptions: readonly { value: Sort; label: string }[] = [
  { value: 'time', label: 'Last attestation' },
  { value: 'name', label: 'Name' },
];

const refreshInterval = 60_000;

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, character => character.codePointAt(0)!);
  const rightPoints = Array.from(right, character => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function compareText(left: string, right: string): number {
  // Lower-case code points ignore case without a locale, so ordering stays deterministic across browsers.
  return compareCodePoints(left.toLowerCase(), right.toLowerCase()) || compareCodePoints(left, right);
}

function compareByName(left: Summary, right: Summary): number {
  const primary = compareText(left.repository, right.repository);
  if (primary) return primary;

  const leftPoints = left.execution_points;
  const rightPoints = right.execution_points;
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    const difference = compareText(leftPoints[index], rightPoints[index]);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function receivedAt(summary: Summary): number {
  const time = Date.parse(summary.received_at);
  return Number.isNaN(time) ? -Infinity : time;
}

function compareByTime(left: Summary, right: Summary): number {
  const leftTime = receivedAt(left);
  const rightTime = receivedAt(right);
  if (leftTime === rightTime) return compareByName(left, right);
  return leftTime < rightTime ? 1 : -1;
}

function sortFromLocation(): Sort {
  return new URLSearchParams(window.location.search).get('sort') === 'name' ? 'name' : 'time';
}

function tileKey(summary: Summary) {
  return JSON.stringify([summary.repository, ...summary.execution_points]);
}

export class DashboardView extends CockpitView<Summary[]> {
  static override properties = { sort: { state: true } };

  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      h2 {
        margin-block: 0;
        font-size: var(--type-brand);
        line-height: var(--line-heading);
      }

      .header {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-2) var(--space-6);
        margin-block-end: var(--space-6);
      }

      .figures, .tiles {
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .figures {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-4);
        font-weight: var(--weight-semibold);
      }

      .sort {
        margin: 0 0 var(--space-4);
        padding: 0;
        border: 0;
      }

      .sort legend {
        float: inline-start;
        padding: 0;
        margin-inline-end: var(--space-3);
      }

      .sort label {
        margin-inline-end: var(--space-3);
      }

      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr));
        gap: var(--space-4);
      }

      .tiles > li {
        display: grid;
      }

      .passed .figure, .figure.passed { color: var(--status-passed); }
      .figure.failed { color: var(--status-failed); }
    }
  `];

  declare sort: Sort;
  private hiddenSince?: number;
  private timer?: number;

  constructor() {
    super();
    this.sort = sortFromLocation();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.timer = window.setInterval(() => this.refresh(), refreshInterval);
    document.addEventListener('visibilitychange', this.visibility);
  }

  override disconnectedCallback() {
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.visibility);
    super.disconnectedCallback();
  }

  private refresh() {
    if (document.visibilityState === 'visible') void this.load(true);
  }

  private readonly visibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenSince = Date.now();
      return;
    }
    const since = this.hiddenSince;
    this.hiddenSince = undefined;
    if (since !== undefined && Date.now() - since > refreshInterval) this.refresh();
  };

  protected override read(signal: AbortSignal) {
    return latestAttestations(signal);
  }

  protected override heading() {
    return 'Dashboard';
  }

  protected override content(summaries?: Summary[]) {
    return html`
      ${summaries === undefined ? nothing : this.results(summaries)}
    `;
  }

  private changeSort(event: Event) {
    this.sort = (event.target as HTMLInputElement).value === 'name' ? 'name' : 'time';
    const url = new URL(window.location.href);
    if (this.sort === 'time') url.searchParams.delete('sort');
    else url.searchParams.set('sort', this.sort);
    window.history.replaceState(null, '', url);
  }

  private results(summaries: Summary[]) {
    if (summaries.length === 0) {
      return html`<pb-empty-state heading="No attestations"
        message="No attestations have been reported yet."></pb-empty-state>`;
    }

    const passing = summaries.filter(summary => summary.overall === 'PASS').length;
    const failing = summaries.length - passing;
    const headline = failing === 0
      ? `All ${summaries.length} passing`
      : `${failing} of ${summaries.length} not passing`;
    const tilesPerRepository = new Map<string, number>();
    for (const { repository } of summaries) {
      tilesPerRepository.set(repository, (tilesPerRepository.get(repository) ?? 0) + 1);
    }
    const sorted = [...summaries].sort(this.sort === 'name' ? compareByName : compareByTime);

    return html`
      <div class="header">
        <h2>${headline}</h2>
        <ul class="figures">
          <li class="figure passed"><span aria-hidden="true">✓</span> ${passing} passing</li>
          <li class="figure failed"><span aria-hidden="true">×</span> ${failing} not passing</li>
        </ul>
      </div>
      <fieldset class="sort">
        <legend>Sort by</legend>
        ${sortOptions.map(option => html`<label><input type="radio" name="sort" .value=${option.value}
          ?checked=${this.sort === option.value} @change=${this.changeSort}> ${option.label}</label>`)}
      </fieldset>
      <ul class="tiles" aria-label="Repositories">
        ${repeat(sorted, tileKey, summary => html`
          <li><pb-repository-tile .summary=${summary}
            .showExecutionPoints=${tilesPerRepository.get(summary.repository)! > 1}></pb-repository-tile></li>
        `)}
      </ul>
    `;
  }
}

customElements.define('pb-dashboard', DashboardView);
