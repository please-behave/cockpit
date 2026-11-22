import { html, nothing } from 'lit';
import { latestAttestations, type Overall, type Summary } from '../api/client';
import '../components/pb-data-table';
import '../components/pb-empty-state';
import '../components/pb-status-pill';
import '../components/pb-time';
import { CockpitView, reportedEvidence } from './cockpit-view';

const columns = ['Repository', 'Execution points', 'Sender', 'Commit', 'Overall',
  'Warnings', 'Not run', 'Last reported'];

const priority: Record<Overall, number> = { ERROR: 0, FAIL: 1, PASS: 2 };

function compareText(left: string, right: string): number {
  // Compare code points so ordering stays deterministic across browser locales.
  const leftPoints = Array.from(left, character => character.codePointAt(0)!);
  const rightPoints = Array.from(right, character => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function compareSummaries(left: Summary, right: Summary): number {
  const primary = priority[left.overall] - priority[right.overall]
    || compareText(left.repository, right.repository);
  if (primary) return primary;

  const leftPoints = left.execution_points;
  const rightPoints = right.execution_points;
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    const difference = compareText(leftPoints[index], rightPoints[index]);
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export class OverviewView extends CockpitView<Summary[]> {
  protected override read(signal: AbortSignal) {
    return latestAttestations(signal);
  }

  protected override heading() {
    return 'Latest attestations';
  }

  protected override content(summaries?: Summary[]) {
    return html`
      ${reportedEvidence}
      ${summaries === undefined ? nothing : this.results(summaries)}
    `;
  }

  private results(summaries: Summary[]) {
    if (summaries.length === 0) {
      return html`<pb-empty-state heading="No attestations"
        message="No attestations have been reported yet."></pb-empty-state>`;
    }

    const rows = [...summaries].sort(compareSummaries).map(summary => ({
      key: summary.id,
      cells: [
        html`<a data-route href=${`/attestations/${encodeURIComponent(summary.id)}`}>${summary.repository}</a>`,
        summary.execution_points.join(', '),
        summary.sender,
        html`<code>${Array.from(summary.commit).slice(0, 7).join('')}</code>`,
        html`<pb-status-pill .status=${summary.overall}></pb-status-pill>`,
        String(summary.warn_count),
        String(summary.not_run_count),
        html`<pb-time .value=${summary.received_at}></pb-time>`,
      ],
    }));

    return html`<pb-data-table label="Latest reported attestations" .columns=${columns}
      row-header-column="0" .rows=${rows}></pb-data-table>`;
  }
}

customElements.define('pb-overview', OverviewView);
