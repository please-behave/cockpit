import { css, html, nothing } from 'lit';
import type { RepositoryOverviewEntry } from '../api/client';
import { stateLabels } from '../repository-health';
import { releasePath } from '../views/router';
import './pb-commit-link';
import './pb-relative-time';
import './pb-status-pill';

export const repositorySummaryStyles = css`
  @layer components {
    .meta.status-allowed { color: var(--status-allowed); }
    .meta.status-warning { color: var(--status-warning); }

    .meta {
      color: var(--text-muted);
      font-size: var(--type-meta);
      line-height: var(--line-meta);
    }
  }
`;

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
    ${check ? html`<span class="meta"><pb-commit-link .repository=${repository}
      .commit=${check.commit}></pb-commit-link> · Reported <pb-relative-time .value=${check.received_at}></pb-relative-time></span>`
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
