import { css, html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { Deployment, DeploymentTarget } from '../api/client';
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
  return html`
    <li class="deployment">
      <h3>${heading === 'target' ? targetLabel(entry.target) : html`
          <a data-route href=${repositoryPath(entry.repository)}>${entry.repository}</a>`}</h3>
      <dl>
        <div><dt>${entry.version === null ? 'Commit' : 'Version'}</dt><dd>${deploymentReference(entry)}</dd></div>
        ${heading === 'repository' ? html`
            <div><dt>Target</dt><dd>${targetLabel(entry.target)}</dd></div>` : nothing}
        <div><dt>Recorded</dt><dd><pb-relative-time .value=${entry.received_at}></pb-relative-time></dd></div>
        <div><dt>Evidence</dt><dd><pb-status-pill .status=${evidenceStatus(entry)}></pb-status-pill></dd></div>
        ${sets.length === 0 ? nothing : html`
          <div class="rule-sets">
            <dt>Completed Rule Sets</dt>
            <dd><ul class="sets" role="list">${sets.map(set => html`
              <li><pb-rule-set-chip .label=${set.name} .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip></li>
            `)}</ul></dd>
          </div>`}
      </dl>
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

    .deployment dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--space-3) var(--space-4);
    }

    .deployment h3, .deployment dl, .deployment dd, .deployments, .sets { margin: 0; }
    .deployment h3 { font-size: inherit; margin-block-end: var(--space-2); }
    .deployment dt { color: var(--text-muted); }
    .deployments, .sets { padding: 0; list-style: none; }
    .deployments { display: grid; gap: var(--space-2); }
    .deployment .rule-sets { grid-column: 1 / -1; }
    .sets { display: flex; flex-wrap: wrap; gap: var(--space-1); }
    .sets li { max-inline-size: 100%; }

    @media (max-width: 52rem) {
      .deployment dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 28rem) {
      .deployment dl { grid-template-columns: minmax(0, 1fr); }
    }
  }
`;
