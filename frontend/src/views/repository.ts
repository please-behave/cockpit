import { css, html, nothing, type CSSResult } from 'lit';
import {
  attestationPage, deployments, latestAttestations, releases, type Deployment, type ReleaseSummary, type Summary,
} from '../api/client';
import '../components/pb-commit-link';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-empty-state';
import { shortName } from '../components/pb-short-name';
import '../components/pb-status-pill';
import '../components/pb-time';
import { CockpitView } from './cockpit-view';
import { compareEvidence, deploymentList, deploymentListStyles, targetLabel } from './deployment-list';
import { releaseList, releaseListStyles } from './releases';

const historyLimit = 100;
const attestationColumns: DataTableColumn[] = [
  { label: 'Execution points', part: 'execution-points' },
  { label: 'Reported', mode: 'content' },
  { label: 'Commit', mode: 'content' },
  { label: 'Overall', mode: 'content' },
];

interface RepositoryData {
  releases: ReleaseSummary[];
  deployments: Deployment[];
  heads: Summary[];
  recent: Summary[];
}

function attestationRow(summary: Summary) {
  return {
    key: summary.id,
    cells: [
      summary.execution_points.join(', ') || 'No execution points',
      html`<a data-route href=${`/attestations/${encodeURIComponent(summary.id)}`}>
        <pb-time .value=${summary.received_at}></pb-time></a>`,
      html`<pb-commit-link .repository=${summary.repository} .commit=${summary.commit}></pb-commit-link>`,
      html`<pb-status-pill .status=${summary.overall}></pb-status-pill>`,
    ],
  };
}

export class RepositoryView extends CockpitView<RepositoryData> {
  static override properties = { repository: { attribute: false } };

  static override styles = [CockpitView.styles as CSSResult, releaseListStyles, deploymentListStyles, css`
    @layer components {
      .canonical { margin-block: var(--space-2) 0; color: var(--text-muted); }
      section { margin-block-start: var(--space-6); }
      h2 { margin-block: 0 var(--space-2); }
      pb-data-table::part(execution-points) { min-inline-size: 10ch; }
      pb-data-table + pb-data-table { margin-block-start: var(--space-4); }
    }
  `];

  declare repository: string;

  protected override heading() {
    return shortName(this.repository);
  }

  protected override async read(signal: AbortSignal): Promise<RepositoryData> {
    const repository = this.repository;
    const [recorded, latest, recent, current] = await Promise.all([
      releases(repository, signal),
      latestAttestations(signal),
      attestationPage({ repository, limit: historyLimit }, signal),
      deployments(signal, repository),
    ]);
    current.sort((a, b) => compareEvidence(a, b) || targetLabel(a.target).localeCompare(targetLabel(b.target)));
    return { releases: recorded, deployments: current, heads: latest.filter(summary => summary.repository === repository), recent };
  }

  protected override content(data?: RepositoryData) {
    return html`
      <p class="canonical">${this.repository}</p>
      <section aria-labelledby="releases">
        <h2 id="releases">Releases</h2>
        <p><a data-route href="/releases">All releases</a></p>
        ${data ? releaseList(data.releases, false) : nothing}
      </section>
      <section aria-labelledby="deployments">
        <h2 id="deployments">Deployments</h2>
        <p><a data-route href="/deployments">All deployments</a></p>
        ${data ? this.currentDeployments(data.deployments) : nothing}
      </section>
      <section aria-labelledby="attestations">
        <h2 id="attestations">Attestations</h2>
        ${data ? this.attestations(data) : nothing}
      </section>
    `;
  }

  private currentDeployments(entries: Deployment[]) {
    return entries.length ? deploymentList(entries, 'target') : html`
      <pb-empty-state heading="No deployments"
        message="No deployments have been recorded for this repository."></pb-empty-state>`;
  }

  private attestations({ heads, recent }: RepositoryData) {
    if (heads.length === 0 && recent.length === 0) {
      return html`<pb-empty-state heading="No attestations"
        message="No attestations have been reported for this repository."></pb-empty-state>`;
    }
    const latestRows = heads.map(attestationRow);
    const recentRows = recent.map(attestationRow);
    return html`
      ${latestRows.length ? html`<pb-data-table label="Latest by execution-point combination"
        .columns=${attestationColumns} .rows=${latestRows} row-header-column="0"></pb-data-table>` : nothing}
      ${recentRows.length ? html`<pb-data-table label="Recent attestations"
        .columns=${attestationColumns} .rows=${recentRows}></pb-data-table>` : nothing}
    `;
  }
}

customElements.define('pb-repository', RepositoryView);
