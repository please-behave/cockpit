import { css, html, nothing, type CSSResult } from 'lit';
import { ifDefined } from 'lit/directives/if-defined.js';
import {
  ApiError, getAttestation, registeredRuleSetVersions,
  type Attestation, type BoundRuleSet, type RegisteredRuleSetVersion, type RuleIdentity,
} from '../api/client';
import { kindTone } from '../components/pb-badge';
import '../components/pb-commit-link';
import type { DataTableColumn, DataTableGroup, DataTableRow } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-fact-strip';
import { shortName } from '../components/pb-short-name';
import '../components/pb-status-pill';
import '../components/pb-relative-time';
import { repositoryReference, repositoryReferenceStyles } from '../components/repository-reference';
import { versionedName } from '../components/pb-rule-set-chip';
import '../components/pb-tooltip';
import {
  explainValue, kindExplanations, overallExplanations, statusExplanations, verificationExplanations,
} from '../components/value-explanations';
import { CockpitView } from './cockpit-view';
import { followHistoryBack, rulePath, ruleSetPath } from './router';

type Result = Attestation['results'][number];
type ResultRow = DataTableRow & { result: Result };

const columns: DataTableColumn<ResultRow>[] = [
  { label: 'Rule', part: 'rule-name', compare: (a, b) => ruleLabel(a.result).localeCompare(ruleLabel(b.result)) },
  { label: 'Kind', mode: 'content', compare: (a, b) => a.result.kind.localeCompare(b.result.kind) },
  { label: 'Status', mode: 'content', compare: (a, b) => a.result.status.localeCompare(b.result.status) },
  { label: 'Verification', mode: 'content',
    compare: (a, b) => a.result.verification.status.localeCompare(b.result.verification.status) },
];

function verificationCell(verification: Result['verification']) {
  const verified = verification.status === 'verified';
  const label = verified ? 'Verified' : 'Unverified';
  return explainValue(html`<pb-status-pill .status=${label}></pb-status-pill>`,
    verificationExplanations, verified ? 'verified' : verification.reason);
}

function hasRegisteredVersion(result: Result) {
  return Boolean(result.rule?.version) &&
    !(result.verification.status === 'unverified' && result.verification.reason === 'unregistered');
}

function ruleLabel(result: Result) {
  const name = hasRegisteredVersion(result) && result.name ? result.name : result.rule?.id ?? result.id;
  return versionedName(name, result.rule?.version);
}

const teaserLimit = 160;

function teaser(description?: string) {
  const text = description?.trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  const characters = Array.from(text);
  return characters.length > teaserLimit ? characters.slice(0, teaserLimit - 1).join('').trimEnd() + '…' : text;
}

function ruleCell(result: Result) {
  const label = ruleLabel(result);
  const { rule } = result;
  if (!rule?.version) return label;
  const description = teaser(result.description);
  const value = hasRegisteredVersion(result)
    ? html`<a data-route href=${rulePath(rule, rule.version)} aria-description=${ifDefined(description)}>${label}</a>`
    : description ? html`<span tabindex="0" aria-description=${description}>${label}</span>` : label;
  return description ? html`<pb-tooltip external-trigger .description=${description}>${value}</pb-tooltip>` : value;
}

type ResultGroup = DataTableGroup<ResultRow> & { rows: ResultRow[] };

interface Detail {
  attestation: Attestation;
  sets: { binding: BoundRuleSet; registration?: RegisteredRuleSetVersion }[];
}

function versionKey({ source, path, id, version }: RuleIdentity & { version?: string }) {
  return JSON.stringify([source, path, id, version]);
}

function resultGroups({ attestation, sets }: Detail): ResultGroup[] {
  const byMember = new Map<string, Set<ResultGroup>>();
  const groups = sets.map(({ binding, registration }) => {
    const description = teaser(binding.description);
    const link = html`<a data-route href=${ruleSetPath(binding, binding.version)}
      aria-description=${ifDefined(description)}>${registration?.name || binding.id} <span class="muted">· ${binding.version}</span></a>`;
    const group: ResultGroup = {
      key: versionKey(binding),
      heading: description ? html`<pb-tooltip external-trigger .description=${description}>${link}</pb-tooltip>` : link,
      rows: [],
    };
    for (const member of registration?.members ?? []) {
      const key = versionKey(member);
      const memberships = byMember.get(key) ?? new Set<ResultGroup>();
      memberships.add(group);
      byMember.set(key, memberships);
    }
    return group;
  });
  const local: ResultGroup = { key: 'local', heading: 'Local rules', rows: [] };
  const unassigned: ResultGroup = { key: 'unassigned', heading: 'Unassigned', rows: [] };

  attestation.results.forEach((result, index) => {
    const memberships = result.rule && byMember.get(versionKey(result.rule));
    const fallback = sets.length > 0 && result.rule?.source === attestation.repository ? local : unassigned;
    const row: ResultRow = {
      result,
      key: String(index),
      cells: [
        ruleCell(result),
        explainValue(html`<pb-badge tone=${ifDefined(kindTone(result.kind))}>${result.kind}</pb-badge>`,
          kindExplanations, result.kind),
        explainValue(html`<pb-status-pill .status=${result.status}></pb-status-pill>`, statusExplanations, result.status),
        verificationCell(result.verification),
      ],
    };
    for (const group of memberships ?? [fallback]) group.rows.push(row);
  });

  return [...groups, ...[local, unassigned].filter(group => group.rows.length > 0)];
}

export class DetailView extends CockpitView<Detail> {
  static override properties = { attestationId: { attribute: false }, origin: { attribute: false } };
  static override styles = [repositoryReferenceStyles, CockpitView.styles as CSSResult, css`
    @layer components {
      pb-fact-strip {
        margin-block-end: var(--space-6);
      }

      pb-data-table {
        container-type: inline-size;
      }

      pb-data-table::part(group-heading) {
        /* Let the result cells size the columns independently of the heading link. */
        contain: inline-size;
        max-inline-size: calc(100cqi - 2 * var(--control-padding-inline));
      }

      pb-data-table::part(rule-name) {
        min-inline-size: min(16rem, 100cqi);
      }

    }
  `];

  declare attestationId: string;
  declare origin?: 'dashboard' | 'history';

  protected override async read(signal: AbortSignal): Promise<Detail> {
    const attestation = await getAttestation(this.attestationId, signal);
    const bindings = new Map((attestation.rule_sets ?? []).map(binding => [versionKey(binding), binding]));
    const histories = new Map<string, Promise<RegisteredRuleSetVersion[]>>();
    const sets = await Promise.all([...bindings.values()].map(async binding => {
      const { source, path, id } = binding;
      const identity = new URLSearchParams({ source, path, id });
      const key = identity.toString();
      let history = histories.get(key);
      if (!history) {
        history = registeredRuleSetVersions(identity, signal).catch(error => {
          if (error instanceof ApiError && error.code === 'rule_set_not_found') return [];
          throw error;
        });
        histories.set(key, history);
      }
      const registration = (await history).find(set => set.version === binding.version);
      return { binding, registration };
    }));
    return { attestation, sets };
  }

  protected override heading(detail?: Detail) {
    return detail ? shortName(detail.attestation.repository) : 'Attestation';
  }

  protected override content(detail?: Detail) {
    return html`
      ${this.backLink()}
      ${detail ? this.results(detail) : nothing}
    `;
  }

  private backLink() {
    if (!this.origin) return html`<p><a data-route href="/">Back to dashboard</a></p>`;
    const history = this.origin === 'history';
    return html`<p><a href=${history ? '/attestations' : '/'} @click=${followHistoryBack}>
      ${history ? 'Back to attestations' : 'Back to dashboard'}
    </a></p>`;
  }

  private results(detail: Detail) {
    const { attestation } = detail;
    const items = [
      { term: 'Overall', description: explainValue(
        html`<pb-status-pill .status=${attestation.overall}></pb-status-pill>`, overallExplanations, attestation.overall,
      ) },
      { term: 'Commit', description: html`<pb-commit-link full .repository=${attestation.repository}
        .commit=${attestation.commit}></pb-commit-link>` },
      { term: 'Reported', description: html`<pb-relative-time .value=${attestation.received_at}></pb-relative-time>` },
      { term: 'Attestation ID', description: html`<code>${attestation.id}</code>` },
      { term: 'Repository', description: repositoryReference(attestation.repository) },
    ];
    return html`
      <pb-fact-strip .items=${items}></pb-fact-strip>
      <pb-data-table label="Rules" .columns=${columns} row-header-column="0" .groups=${resultGroups(detail)}></pb-data-table>
    `;
  }
}

customElements.define('pb-attestation', DetailView);
