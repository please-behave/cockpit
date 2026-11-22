import { html, nothing } from 'lit';
import { getAttestation, type Attestation } from '../api/client';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-definition-list';
import '../components/pb-short-name';
import '../components/pb-status-pill';
import '../components/pb-time';
import { CockpitView, reportedEvidence } from './cockpit-view';
import type { Origin } from './router';

const columns: DataTableColumn[] = [
  { label: 'Rule', mode: 'fill' },
  { label: 'Kind', mode: 'content' },
  { label: 'Status', mode: 'content' },
];

export class DetailView extends CockpitView<Attestation> {
  static override properties = { attestationId: { attribute: false }, origin: { attribute: false } };
  declare attestationId: string;
  declare origin?: Origin;

  protected override read(signal: AbortSignal) {
    return getAttestation(this.attestationId, signal);
  }

  protected override heading(attestation?: Attestation) {
    return attestation?.repository ?? 'Attestation';
  }

  protected override content(attestation?: Attestation) {
    return html`
      ${this.backLink()}
      ${reportedEvidence}
      ${attestation ? this.results(attestation) : nothing}
    `;
  }

  private backLink() {
    if (!this.origin) return html`<p><a data-route href="/">Back to dashboard</a></p>`;
    const history = this.origin === 'history';
    return html`<p><a href=${history ? '/attestations' : '/'} @click=${this.back}>
      ${history ? 'Back to attestations' : 'Back to dashboard'}
    </a></p>`;
  }

  private readonly back = (event: MouseEvent) => {
    if (event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    window.history.back();
  };

  private results(attestation: Attestation) {
    const items = [
      { term: 'Attestation ID', description: html`<code>${attestation.id}</code>` },
      { term: 'Commit', description: html`<code>${attestation.commit}</code>` },
      { term: 'Overall', description: html`<pb-status-pill .status=${attestation.overall}></pb-status-pill>` },
      { term: 'Reported', description: html`<pb-time .value=${attestation.received_at}></pb-time>` },
    ];
    const rows = attestation.results.map((result, index) => ({
      key: String(index),
      cells: [
        html`<pb-short-name .value=${result.id}></pb-short-name>`,
        result.kind,
        html`<pb-status-pill .status=${result.status}></pb-status-pill>`,
      ],
    }));

    return html`
      <pb-definition-list .items=${items}></pb-definition-list>
      <pb-data-table label="Rules" .columns=${columns} row-header-column="0" .rows=${rows}></pb-data-table>
    `;
  }
}

customElements.define('pb-attestation', DetailView);
