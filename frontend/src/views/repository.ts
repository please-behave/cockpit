import { css, html, nothing, type CSSResult } from 'lit';
import {
  attestationPage, completedRuleSets, deployments, latestAttestations, releases,
  type CompletedRuleSet, type Deployment, type ReleaseSummary, type Summary,
} from '../api/client';
import '../components/pb-commit-link';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-empty-state';
import { ruleSetLabel } from '../components/pb-rule-set-chip';
import { shortName } from '../components/pb-short-name';
import '../components/pb-status-pill';
import '../components/pb-time';
import { CockpitView } from './cockpit-view';
import { compareEvidence, deploymentTableStyles, repositoryDeploymentTable, targetLabel } from './deployment-table';
import { releaseTable } from './releases';
import { ruleSetPath } from './router';

const historyLimit = 100;
const attestationColumns: DataTableColumn[] = [
  { label: 'Execution points', part: 'execution-points' },
  { label: 'Reported', mode: 'content' },
  { label: 'Commit', mode: 'content' },
  { label: 'Overall', mode: 'content' },
];

type AttestationRow = ReturnType<typeof attestationRow>;
const latestColumns: DataTableColumn<AttestationRow>[] = [
  { ...attestationColumns[0], compare: (a, b) => a.cells[0].localeCompare(b.cells[0]) },
  { ...attestationColumns[1], compare: (a, b) => Date.parse(a.summary.received_at) - Date.parse(b.summary.received_at) },
  { ...attestationColumns[2], compare: (a, b) => a.summary.commit.localeCompare(b.summary.commit) },
  { ...attestationColumns[3], compare: (a, b) => a.summary.overall.localeCompare(b.summary.overall) },
];

interface RepositoryData {
  releases: ReleaseSummary[];
  deployments: Deployment[];
  completedSets: CompletedRuleSet[];
  heads: Summary[];
  recent: Summary[];
}

function attestationRow(summary: Summary) {
  return {
    key: summary.id,
    summary,
    cells: [
      summary.execution_points.join(', ') || 'No execution points',
      html`<pb-time .href=${`/attestations/${encodeURIComponent(summary.id)}`}
        .value=${summary.received_at}></pb-time>`,
      html`<pb-commit-link .repository=${summary.repository} .commit=${summary.commit}></pb-commit-link>`,
      html`<pb-status-pill .status=${summary.overall}></pb-status-pill>`,
    ] as const,
  };
}

export class RepositoryView extends CockpitView<RepositoryData> {
  static override properties = { repository: { attribute: false } };

  static override styles = [CockpitView.styles as CSSResult, deploymentTableStyles, css`
    @layer components {
      .canonical { margin-block: var(--space-2) 0; }
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
    const [recorded, latest, recent, current, completed] = await Promise.all([
      releases(repository, signal),
      latestAttestations(signal),
      attestationPage({ repository, limit: historyLimit }, signal),
      deployments(signal, repository),
      completedRuleSets(signal),
    ]);
    current.sort((a, b) => compareEvidence(a, b) || targetLabel(a.target).localeCompare(targetLabel(b.target)));
    return {
      releases: recorded, deployments: current, recent,
      heads: latest.filter(summary => summary.repository === repository),
      completedSets: completed.find(entry => entry.repository === repository)?.sets ?? [],
    };
  }

  protected override content(data?: RepositoryData) {
    return html`
      <p class="canonical muted">${this.repository}</p>
      <section aria-labelledby="completed-rule-sets">
        <h2 id="completed-rule-sets">Completed Rule Sets</h2>
        ${data ? this.ruleSets(data.completedSets) : nothing}
      </section>
      <section aria-labelledby="releases">
        <h2 id="releases">Releases</h2>
        <p><a data-route href="/releases">All releases</a></p>
        ${data ? releaseTable(data.releases, 'Release history') : nothing}
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

  private ruleSets(sets: CompletedRuleSet[]) {
    return sets.length ? html`<ul class="sets" role="list">${sets.map(set => html`
      <li><pb-rule-set-chip .label=${ruleSetLabel(set.name, set.version)}
        .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip></li>
    `)}</ul>` : html`<p>No completed Rule Sets.</p>`;
  }

  private currentDeployments(entries: Deployment[]) {
    return entries.length ? repositoryDeploymentTable(entries) : html`
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
        .columns=${latestColumns} .rows=${latestRows} row-header-column="0"></pb-data-table>` : nothing}
      ${recentRows.length ? html`<pb-data-table label="Recent attestations"
        .columns=${attestationColumns} .rows=${recentRows}></pb-data-table>` : nothing}
    `;
  }
}

customElements.define('pb-repository', RepositoryView);
