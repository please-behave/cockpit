import { css, html, nothing, type CSSResult } from 'lit';
import { getAttestation, type Attestation } from '../api/client';
import '../components/pb-commit-link';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-definition-list';
import '../components/pb-status-pill';
import '../components/pb-time';
import '../components/pb-tooltip';
import { CockpitView } from './cockpit-view';
import { followHistoryBack, rulePath } from './router';

const columns: DataTableColumn[] = [
  { label: 'Rule', part: 'rule-name' },
  { label: 'Kind', mode: 'content' },
  { label: 'Status', mode: 'content' },
  { label: 'Verification', mode: 'content' },
];

const verificationReasons = {
  unregistered: 'No rule is registered for this identity and version, so the ledger could not check the result.',
  mismatch: 'The reported rule differs from its registered version: the digest does not match.',
};

function verificationCell(verification: Attestation['results'][number]['verification']) {
  if (verification.status === 'verified') return html`<pb-status-pill status="Verified"></pb-status-pill>`;
  return html`
    <pb-tooltip hint .description=${verificationReasons[verification.reason]}>
      <pb-status-pill status="Unverified"></pb-status-pill>
    </pb-tooltip>
  `;
}

function ruleCell({ id, name, rule, verification }: Attestation['results'][number]) {
  if (!rule?.version || (verification.status === 'unverified' && verification.reason === 'unregistered')) {
    return rule?.id ?? id;
  }
  return html`
    <a data-route href=${rulePath(rule, rule.version)}>${name || rule.id}</a>
    <div part="rule-version"><code>${rule.version}</code></div>
  `;
}

export class DetailView extends CockpitView<Attestation> {
  static override properties = { attestationId: { attribute: false }, origin: { attribute: false } };
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      pb-data-table::part(rule-name) {
        min-inline-size: 12ch;
      }

      pb-data-table::part(rule-version) {
        color: var(--text-muted);
        font-weight: normal;
      }
    }
  `];

  declare attestationId: string;
  declare origin?: 'dashboard' | 'history';

  protected override read(signal: AbortSignal) {
    return getAttestation(this.attestationId, signal);
  }

  protected override heading(attestation?: Attestation) {
    return attestation?.repository ?? 'Attestation';
  }

  protected override content(attestation?: Attestation) {
    return html`
      ${this.backLink()}
      ${attestation ? this.results(attestation) : nothing}
    `;
  }

  private backLink() {
    if (!this.origin) return html`<p><a data-route href="/">Back to dashboard</a></p>`;
    const history = this.origin === 'history';
    return html`<p><a href=${history ? '/attestations' : '/'} @click=${followHistoryBack}>
      ${history ? 'Back to attestations' : 'Back to dashboard'}
    </a></p>`;
  }

  private results(attestation: Attestation) {
    const items = [
      { term: 'Attestation ID', description: html`<code>${attestation.id}</code>` },
      { term: 'Commit', description: html`<pb-commit-link full .repository=${attestation.repository}
        .commit=${attestation.commit}></pb-commit-link>` },
      { term: 'Overall', description: html`<pb-status-pill .status=${attestation.overall}></pb-status-pill>` },
      { term: 'Reported', description: html`<pb-time .value=${attestation.received_at}></pb-time>` },
    ];
    const rows = attestation.results.map((result, index) => ({
      key: String(index),
      cells: [
        ruleCell(result),
        result.kind,
        html`<pb-status-pill .status=${result.status}></pb-status-pill>`,
        verificationCell(result.verification),
      ],
    }));

    return html`
      <pb-definition-list .items=${items}></pb-definition-list>
      <pb-data-table label="Rules" .columns=${columns} row-header-column="0" .rows=${rows}></pb-data-table>
    `;
  }
}

customElements.define('pb-attestation', DetailView);
