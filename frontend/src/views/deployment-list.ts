import { css, html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Deployment, DeploymentTarget } from '../api/client';
import type { KeyValueItem } from '../components/pb-key-value';
import '../components/pb-key-value';
import '../components/pb-relative-time';
import '../components/pb-rule-set-chip';
import '../components/pb-status-pill';
import '../components/pb-tooltip';
import { releasePath, repositoryPath, ruleSetPath } from './router';

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

function deploymentReference(entry: Deployment) {
  if (entry.state === 'release_not_recorded') return entry.version;
  if (entry.version !== null) {
    return html`<a data-route href=${releasePath(entry.repository, entry.version)}>${entry.version}</a>`;
  }
  return html`<pb-tooltip .description=${entry.reported_commit}>
    <code>${entry.reported_commit.slice(0, 7)}</code></pb-tooltip>`;
}

function deploymentRow(entry: Deployment, heading: 'repository' | 'target') {
  const sets = entry.evidence?.completed_rule_sets ?? [];
  const items: KeyValueItem[] = [{ term: entry.version === null ? 'Commit' : 'Version', description: deploymentReference(entry) }];
  if (heading === 'repository') items.push({ term: 'Target', description: targetLabel(entry.target) });
  items.push(
    { term: 'Recorded', description: html`<pb-relative-time .value=${entry.received_at}></pb-relative-time>` },
    { term: 'Evidence', description: html`<pb-status-pill .status=${evidenceStatus(entry)}></pb-status-pill>` },
  );
  if (sets.length) items.push({
    term: 'Completed Rule Sets',
    fullWidth: true,
    description: html`<ul class="chips" role="list">${sets.map(set => html`
      <li><pb-rule-set-chip .label=${set.name} .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip></li>
    `)}</ul>`,
  });
  return html`
    <li class="deployment">
      <h3>${heading === 'target' ? targetLabel(entry.target) : html`
          <a data-route href=${repositoryPath(entry.repository)}>${entry.repository}</a>`}</h3>
      <pb-key-value .items=${items}></pb-key-value>
    </li>`;
}

export function deploymentList(entries: Deployment[], heading: 'repository' | 'target') {
  return html`<ul class="deployments" role="list">${repeat(entries, entry => entry.id,
    entry => deploymentRow(entry, heading))}</ul>`;
}

export const deploymentListStyles = css`
  @layer components {
    .deployment {
      overflow-wrap: anywhere;
      padding: var(--panel-padding);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-panel);
      background: var(--surface-raised);
    }

    .deployment h3 { font-size: inherit; margin: 0 0 var(--space-2); }
    .deployments {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: var(--space-2);
    }
  }
`;
