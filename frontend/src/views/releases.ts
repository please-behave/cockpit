import { css, html, nothing, type CSSResult } from 'lit';
import { releases, type ReleaseSummary } from '../api/client';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-empty-state';
import '../components/pb-relative-time';
import '../components/pb-rule-set-summary';
import '../components/pb-status-pill';
import '../components/pb-tooltip';
import { CockpitView } from './cockpit-view';
import { releasePath, repositoryPath } from './router';

const evidenceColumns: DataTableColumn[] = [
  { label: 'Recorded', mode: 'content' },
  { label: 'Evidence', mode: 'content' },
  { label: 'Completed Rule Sets', mode: 'content' },
];

const overviewColumns: DataTableColumn[] = [
  { label: 'Repository', mode: 'fill', part: 'repository' },
  { label: 'Newest version', mode: 'fill', part: 'newest-version' },
  ...evidenceColumns,
];

const historyColumns: DataTableColumn[] = [
  { label: 'Version', mode: 'fill' },
  { label: 'Commit', mode: 'content' },
  ...evidenceColumns,
];

function needsAttention({ evidence }: ReleaseSummary) {
  return evidence === null || evidence.overall === 'FAIL' || evidence.overall === 'ERROR';
}

function releaseRow(entry: ReleaseSummary, overview: boolean) {
  const version = html`<pb-tooltip text-value external-trigger .description=${entry.version}>
    <a data-route href=${releasePath(entry.repository, entry.version)}>${entry.version}</a>
  </pb-tooltip>`;
  const commit = entry.commit.slice(0, 7);
  const identity = overview ? [
    html`<pb-tooltip text-value external-trigger .description=${entry.repository}>
      <a data-route href=${repositoryPath(entry.repository)}>${entry.repository}</a>
    </pb-tooltip>`,
    version,
  ] : [
    version,
    html`<pb-tooltip text-value .description=${entry.commit} .visibleText=${commit}><code>${commit}</code></pb-tooltip>`,
  ];
  return {
    key: overview ? entry.repository : entry.version,
    cells: [
      ...identity,
      html`<pb-relative-time .value=${entry.received_at}></pb-relative-time>`,
      html`<pb-status-pill .status=${entry.evidence?.overall ?? 'No evidence'}></pb-status-pill>`,
      html`<pb-rule-set-summary .sets=${entry.evidence?.completed_rule_sets ?? []}></pb-rule-set-summary>`,
    ],
  };
}

export function releaseTable(entries: ReleaseSummary[], label: 'Releases' | 'Release history') {
  const overview = label === 'Releases';
  if (entries.length === 0) {
    return html`<pb-empty-state heading="No releases" .message=${overview
      ? 'No release has been recorded yet.'
      : 'No release has been recorded for this repository.'}></pb-empty-state>`;
  }
  return html`<pb-data-table .label=${label} ?hide-caption=${overview} .columns=${overview ? overviewColumns : historyColumns}
    .rows=${entries.map(entry => releaseRow(entry, overview))} row-header-column="0"></pb-data-table>`;
}

export class ReleasesView extends CockpitView<ReleaseSummary[]> {
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      :host { overflow-anchor: none; }

      pb-data-table::part(repository) { min-inline-size: 16ch; }
      pb-data-table::part(newest-version) { inline-size: 20%; min-inline-size: 14ch; }
    }
  `];

  protected override readonly refreshable = true;
  protected override get headingVisible() { return false; }

  protected override heading() {
    return 'Releases';
  }

  protected override async read(signal: AbortSignal) {
    const entries = await releases(null, signal);
    return entries.sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a))
      || a.repository.localeCompare(b.repository));
  }

  protected override content(entries?: ReleaseSummary[]) {
    return html`${entries === undefined ? nothing : releaseTable(entries, 'Releases')}`;
  }
}

customElements.define('pb-releases', ReleasesView);
