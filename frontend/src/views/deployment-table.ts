import { css, html } from 'lit';
import type { Deployment, DeploymentTarget } from '../api/client';
import type { DataTableColumn, DataTableGroup } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-relative-time';
import { repositoryReference } from '../components/repository-reference';
import '../components/pb-rule-set-summary';
import '../components/pb-status-pill';
import '../components/pb-tooltip';
import { releasePath } from './router';

export const statuses = ['ERROR', 'FAIL', 'release not recorded', 'No evidence', 'PASS'] as const;
type EvidenceStatus = typeof statuses[number];

export function evidenceStatus(entry: Deployment): EvidenceStatus {
  if (entry.state === 'release_not_recorded') return 'release not recorded';
  return entry.evidence?.overall ?? 'No evidence';
}

export function targetKey({ owner, name }: DeploymentTarget) {
  return JSON.stringify([owner, name]);
}

export function targetLabel({ owner, name }: DeploymentTarget) {
  return `${owner} · ${name}`;
}

export function compareEvidence(a: Deployment, b: Deployment) {
  return statuses.indexOf(evidenceStatus(a)) - statuses.indexOf(evidenceStatus(b));
}

type Identity = 'repository' | 'target';

const facts: DataTableColumn[] = [
  { label: 'Evidence', mode: 'content' },
  { label: 'Version or commit', mode: 'fill', part: 'version' },
  { label: 'Reported', mode: 'content' },
  { label: 'Completed Rule Sets', mode: 'content', part: 'completed-sets' },
];

const columns: Record<Identity, DataTableColumn[]> = {
  repository: [{ label: 'Repository', mode: 'fill', part: 'identity' }, ...facts],
  target: [{ label: 'Target', mode: 'fill', part: 'identity' }, ...facts],
};

function textWithPreview(value: string) {
  return html`<pb-tooltip text-value .description=${value}>
    <span>${value}</span>
  </pb-tooltip>`;
}

function deploymentReference(entry: Deployment) {
  if (entry.state === 'release_not_recorded') return textWithPreview(entry.version);
  if (entry.version !== null) {
    return html`<pb-tooltip text-value external-trigger .description=${entry.version}>
      <a data-route href=${releasePath(entry.repository, entry.version)}>${entry.version}</a>
    </pb-tooltip>`;
  }
  const commit = entry.reported_commit.slice(0, 7);
  return html`<pb-tooltip text-value .description=${entry.reported_commit} .visibleText=${commit}>
    <code>${commit}</code>
  </pb-tooltip>`;
}

function deploymentRow(entry: Deployment, identity: Identity, key: string = entry.id) {
  return {
    key,
    cells: [
      identity === 'target' ? textWithPreview(targetLabel(entry.target)) : repositoryReference(entry.repository),
      html`<pb-status-pill .status=${evidenceStatus(entry)}></pb-status-pill>`,
      deploymentReference(entry),
      html`<pb-relative-time .value=${entry.received_at}></pb-relative-time>`,
      html`<pb-rule-set-summary .sets=${entry.evidence?.completed_rule_sets ?? []}></pb-rule-set-summary>`,
    ],
  };
}

export type DeploymentGroup = { key: string; label: string; rows: Deployment[] };

export function groupedDeploymentTable(groups: DeploymentGroup[], groupBy: Identity) {
  const identity = groupBy === 'target' ? 'repository' : 'target';
  const tableGroups: DataTableGroup[] = groups.map(({ key, label, rows }) => {
    const status = evidenceStatus(rows[0]);
    const count = rows.filter(row => evidenceStatus(row) === status).length;
    const name = groupBy === 'repository'
      ? repositoryReference(label)
      : textWithPreview(label);
    return {
      key,
      heading: html`<span class="group-summary">
        <pb-status-pill .status=${status}></pb-status-pill> ·
        <span class="group-count">${count} of ${rows.length} <span
          class="group-unit">${rows.length === 1 ? 'deployment' : 'deployments'}</span></span> ·
        ${name}
      </span>`,
      rows: rows.map(entry => deploymentRow(entry, identity,
        identity === 'target' ? targetKey(entry.target) : entry.repository)),
    };
  });
  return html`<pb-data-table label="Deployments" hide-caption .columns=${columns[identity]} .groups=${tableGroups}
    row-header-column="0"></pb-data-table>`;
}

export function repositoryDeploymentTable(entries: Deployment[]) {
  return html`<pb-data-table label="Current deployments" .columns=${columns.target}
    .rows=${entries.map(entry => deploymentRow(entry, 'target'))} row-header-column="0"></pb-data-table>`;
}

export const deploymentTableStyles = css`
  @layer components {
    /* Leave room for the longest outcome, “Release not recorded”. */
    pb-data-table { --narrow-identity-width: clamp(8ch, 100cqi - 11rem, 13ch); }
  }
`;
