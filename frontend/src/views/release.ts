import { css, html, nothing, type CSSResult } from 'lit';
import { getRelease, type AuthMethod, type ReleaseDetail } from '../api/client';
import '../components/pb-commit-link';
import '../components/pb-key-value';
import '../components/pb-rule-set-chip';
import '../components/pb-status-pill';
import '../components/pb-time';
import '../components/pb-widget';
import { CockpitView } from './cockpit-view';
import { repositoryPath, rulePath, ruleSetPath } from './router';

const methods: Record<AuthMethod, string> = { api_key: 'API key', github_oidc: 'GitHub OIDC' };

function sender({ sender, auth_method }: ReleaseDetail) {
  return html`
    <div>${sender}</div>
    ${auth_method === 'api_key'
      ? html`<div><pb-status-pill status="API key"></pb-status-pill></div>
        <div>The sender is self-asserted: an API key is not bound to the repository.</div>`
      : html`<div>${methods[auth_method]}</div>`}
  `;
}

function ruleSets({ rule_sets }: NonNullable<ReleaseDetail['evidence']>) {
  if (rule_sets.length === 0) return html`<p>No Rule Sets are bound at check in this attestation.</p>`;
  return html`<ul class="rule-sets" role="list">${rule_sets.map(set => html`
    <li>
      <pb-widget heading-level="3">
        <pb-rule-set-chip slot="heading" .label=${`${set.name || set.id} · ${set.version}`}
          .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip>
        <pb-status-pill slot="metadata" .status=${set.complete ? 'Complete' : 'Incomplete'}></pb-status-pill>
        ${set.registered ? nothing : html`<p>Version is unregistered.</p>`}
        ${!set.complete && set.non_passing_members.length ? html`<ul class="non-passing" aria-label="Non-passing rules">
          ${set.non_passing_members.map(member => html`<li>
            <a data-route href=${rulePath(member, member.version)}>${member.id} ${member.version}</a>
            <pb-status-pill .status=${member.status}></pb-status-pill>
          </li>`)}
        </ul>` : nothing}
      </pb-widget>
    </li>`)}</ul>`;
}

function evidence({ evidence }: ReleaseDetail) {
  return html`
    <pb-widget class="evidence" heading="Evidence"
      .link=${evidence ? { href: `/attestations/${encodeURIComponent(evidence.id)}`, label: 'View attestation' } : undefined}>
      ${evidence === null ? html`
        <p><pb-status-pill status="No evidence"></pb-status-pill></p>
        <p>No attestation with results at check has been reported for this commit.</p>
      ` : html`
        <p>
          <pb-status-pill .status=${evidence.overall}></pb-status-pill>
        </p>
        ${ruleSets(evidence)}
      `}
    </pb-widget>`;
}

export class ReleaseView extends CockpitView<ReleaseDetail> {
  static override properties = { repository: { attribute: false }, version: { attribute: false } };
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      :host { overflow-wrap: anywhere; }
      pb-key-value { margin-block-end: var(--space-6); }
      .evidence > p { margin-block: 0; }
      .evidence > p + p { margin-block-start: var(--space-2); }
      .evidence > p + .rule-sets { margin-block-start: var(--space-2); }
      .rule-sets {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
      }
      .non-passing { padding-inline-start: var(--space-4); margin-block-end: 0; }
      .non-passing li + li { margin-block-start: var(--space-2); }
    }
  `];

  declare repository: string;
  declare version: string;

  protected override read(signal: AbortSignal) {
    return getRelease(this.repository, this.version, signal);
  }

  protected override heading(release?: ReleaseDetail) {
    return release?.version ?? this.version;
  }

  protected override content(release?: ReleaseDetail) {
    const items = release ? [
      { term: 'Version', description: release.version },
      { term: 'Repository', description: html`<a data-route href=${repositoryPath(release.repository)}>${release.repository}</a>` },
      { term: 'Commit', description: html`<pb-commit-link full .repository=${release.repository}
        .commit=${release.commit}></pb-commit-link>` },
      { term: 'Recorded', description: html`<pb-time .value=${release.received_at}></pb-time>` },
      { term: 'Sender', description: sender(release) },
    ] : [];
    return html`
      <p><a data-route href=${repositoryPath(this.repository)}>Back to repository</a></p>
      ${release ? html`<pb-key-value .items=${items}></pb-key-value>${evidence(release)}` : nothing}
    `;
  }
}

customElements.define('pb-release', ReleaseView);
