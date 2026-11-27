import { css, html, nothing, type TemplateResult } from 'lit';
import type { RepositoryOverviewEntry } from '../api/client';
import { stateLabels } from '../repository-health';
import { releasePath } from '../views/router';
import { ownerName } from './pb-short-name';
import './pb-commit-link';
import './pb-relative-time';
import './pb-status-pill';

export const repositorySummaryStyles = css`
  @layer components {
    .meta.status-allowed { color: var(--status-allowed); }
    .meta.status-warning { color: var(--status-warning); }

    .owner, .meta {
      color: var(--text-muted);
      font-size: var(--type-meta);
      line-height: var(--line-meta);
    }

    .identifiers {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: var(--space-2);
    }

    .identifiers pb-rule-set-summary {
      flex: none;
    }
  }
`;

export function repositoryIdentifiers(repository: string, sets: TemplateResult | typeof nothing) {
  const owner = ownerName(repository);
  return owner || sets !== nothing ? html`<div class="identifiers">
    ${owner ? html`<span class="owner">${owner}</span>` : nothing}
    ${sets}
  </div>` : nothing;
}

export function repositoryVerdict(entry: RepositoryOverviewEntry) {
  return html`<pb-status-pill .status=${entry.latest_check?.overall ?? 'No evidence'}></pb-status-pill>`;
}

export function repositoryEvidence(entry: RepositoryOverviewEntry) {
  const {
    repository, state, status_token, latest_check: check, head, pending_since: pendingSince,
    latest_release: release, latest_deployment: deployment,
  } = entry;
  const managedLabel = entry.managed ? nothing : ' · Not managed';
  return html`
    ${check ? html`<span class="meta">Reported <pb-commit-link .repository=${repository}
      .commit=${check.commit}></pb-commit-link> · <pb-relative-time .value=${check.received_at}></pb-relative-time></span>`
      : nothing}
    ${head && !head.direct_evidence && pendingSince && (state === 'pending' || state === 'overdue') ? html`
      <span class="meta ${status_token}">${stateLabels[state]}${state === 'overdue'
        ? html` (step ${entry.overdue_step} of ${entry.overdue_steps})` : nothing}
        · head <pb-commit-link .repository=${repository} .commit=${head.commit}></pb-commit-link>
        · awaiting evidence for <pb-relative-time duration .value=${pendingSince}></pb-relative-time>
        · ${entry.observed_heads_since_evidence} observed ${entry.observed_heads_since_evidence === 1 ? 'head' : 'heads'} since evidence${managedLabel}</span>`
      : html`<span class="meta">${stateLabels[state]}${managedLabel}</span>`}
    ${release || deployment ? html`<div class="meta facts">
      ${release ? html`Release <a class="release-link" data-route
        href=${releasePath(repository, release.version)}>${release.version}</a>` : nothing}
      ${release && deployment ? ' · ' : nothing}
      ${deployment ? html`${release ? nothing : 'Deployed to '}${deployment.name},
        <pb-relative-time .value=${deployment.received_at}></pb-relative-time>` : nothing}
    </div>` : nothing}
  `;
}
