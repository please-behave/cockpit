import { css, html, nothing, type CSSResult } from 'lit';
import { releases, type ReleaseSummary } from '../api/client';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-empty-state';
import '../components/pb-relative-time';
import { repositoryReference } from '../components/repository-reference';
import '../components/pb-rule-set-summary';
import '../components/pb-status-pill';
import '../components/pb-tooltip';
import { CockpitView } from './cockpit-view';
import { releasePath } from './router';

const evidenceColumns: DataTableColumn[] = [
  { label: 'Reported', mode: 'content' },
  { label: 'Evidence', mode: 'content' },
  { label: 'Completed Rule Sets', mode: 'content' },
];

const overviewColumns: DataTableColumn[] = [
  { label: 'Repository', mode: 'fill', part: 'identity' },
  { label: 'Evidence', mode: 'content' },
  { label: 'Newest version', mode: 'fill', part: 'version' },
  { label: 'Reported', mode: 'content' },
  { label: 'Completed Rule Sets', mode: 'content', part: 'completed-sets' },
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
  const reported = html`<pb-relative-time .value=${entry.received_at}></pb-relative-time>`;
  const evidence = html`<pb-status-pill .status=${entry.evidence?.overall ?? 'No evidence'}></pb-status-pill>`;
  const sets = html`<pb-rule-set-summary .sets=${entry.evidence?.completed_rule_sets ?? []}></pb-rule-set-summary>`;
  return {
    key: overview ? entry.repository : entry.version,
    cells: overview ? [repositoryReference(entry.repository), evidence, version, reported, sets] : [
      version,
      html`<pb-tooltip text-value .description=${entry.commit} .visibleText=${commit}><code>${commit}</code></pb-tooltip>`,
      reported, evidence, sets,
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
