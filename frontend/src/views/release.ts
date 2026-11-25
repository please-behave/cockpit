import { css, html, nothing, type CSSResult } from 'lit';
import { getRelease, type AuthMethod, type ReleaseDetail } from '../api/client';
import '../components/pb-commit-link';
import '../components/pb-fact-strip';
import '../components/pb-panel';
import '../components/pb-rule-set-chip';
import '../components/pb-status-pill';
import '../components/pb-time';
import { CockpitView } from './cockpit-view';
import { repositoryReleasesPath, rulePath, ruleSetPath } from './router';

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
      <pb-panel>
        <div class="binding">
          <pb-rule-set-chip .label=${`${set.name || set.id} · ${set.version}`}
            .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip>
          <pb-status-pill .status=${set.complete ? 'Complete' : 'Incomplete'}></pb-status-pill>
        </div>
        ${set.registered ? nothing : html`<p>Version is unregistered.</p>`}
        ${!set.complete && set.non_passing_members.length ? html`<ul class="non-passing" aria-label="Non-passing rules">
          ${set.non_passing_members.map(member => html`<li>
            <a data-route href=${rulePath(member, member.version)}>${member.id} ${member.version}</a>
            <pb-status-pill .status=${member.status}></pb-status-pill>
          </li>`)}
        </ul>` : nothing}
      </pb-panel>
    </li>`)}</ul>`;
}

function evidence({ evidence }: ReleaseDetail) {
  return html`
    <section aria-labelledby="evidence">
      <h2 id="evidence">Evidence</h2>
      ${evidence === null ? html`
        <p><pb-status-pill status="No evidence"></pb-status-pill></p>
        <p>No attestation with results at check has been reported for this commit.</p>
      ` : html`
        <p>
          <pb-status-pill .status=${evidence.overall}></pb-status-pill>
          <a data-route href=${`/attestations/${encodeURIComponent(evidence.id)}`}>View attestation</a>
        </p>
        ${ruleSets(evidence)}
      `}
    </section>`;
}

export class ReleaseView extends CockpitView<ReleaseDetail> {
  static override properties = { repository: { attribute: false }, version: { attribute: false } };
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      :host { overflow-wrap: anywhere; }
      pb-fact-strip { margin-block-end: var(--space-6); }
      section { margin-block-start: var(--space-4); }
      h2 { margin-block: 0 var(--space-2); }
      .rule-sets { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-2); }
      .binding {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-3);
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
      { term: 'Repository', description: release.repository },
      { term: 'Commit', description: html`<pb-commit-link full .repository=${release.repository}
        .commit=${release.commit}></pb-commit-link>` },
      { term: 'Recorded', description: html`<pb-time .value=${release.received_at}></pb-time>` },
      { term: 'Sender', description: sender(release) },
    ] : [];
    return html`
      <p><a data-route href=${repositoryReleasesPath(this.repository)}>Back to ${this.repository} releases</a></p>
      ${release ? html`<pb-fact-strip .items=${items}></pb-fact-strip>${evidence(release)}` : nothing}
    `;
  }
}

customElements.define('pb-release', ReleaseView);
