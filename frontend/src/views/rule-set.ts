import { css, html, nothing, type CSSResult, type TemplateResult } from 'lit';
import {
  registeredRuleSetVersions, ruleSetCompliance, type RegisteredRuleSetVersion, type RuleSetCompliance,
} from '../api/client';
import '../components/pb-badge';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-data-table';
import '../components/pb-key-value';
import { ruleSetLabel } from '../components/pb-rule-set-chip';
import '../components/pb-section';
import '../components/pb-status-pill';
import '../components/pb-time';
import '../components/pb-widget';
import { CockpitView } from './cockpit-view';
import { selectedVersion, versionSelector, versionSelectorStyles } from './registry-version';
import { rulePath } from './router';

type RuleSetDetail = { versions: RegisteredRuleSetVersion[]; repositories: RuleSetCompliance[] };

const text = (value: unknown) => typeof value === 'string' && value ? value : undefined;
const entries = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

function object(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
}

function field(label: string, value: unknown) {
  const content = text(value);
  return content ? { term: label, description: content } : undefined;
}

function listField(label: string, values: (string | TemplateResult)[]) {
  return values.length ? {
    term: label,
    description: html`<ul>${values.map(value => html`<li>${value}</li>`)}</ul>`,
  } : undefined;
}

function knowledgeDocument(knowledge: Record<string, unknown> = {}) {
  const fields = [
    field('Purpose', knowledge.purpose),
    field('Audience', knowledge.audience),
    field('Commonality', knowledge.commonality),
    listField('Admission criteria', entries(knowledge.admission).map(text).filter(value => value !== undefined)),
    field('Execution points', knowledge.execution_points),
    listField('Excluded', entries(knowledge.excluded).flatMap(value => {
      const entry = object(value);
      const description = text(entry?.description);
      const rationale = text(entry?.rationale);
      const ruleSet = text(entry?.ruleset);
      return description && rationale ? [html`${description} · ${rationale}${ruleSet ? html` · ${ruleSet}` : nothing}`] : [];
    })),
    listField('Complements', entries(knowledge.complements).flatMap(value => {
      const entry = object(value);
      const ruleSet = text(entry?.ruleset);
      const rationale = text(entry?.rationale);
      return ruleSet && rationale ? [html`${ruleSet} · ${rationale}`] : [];
    })),
    listField('References', entries(knowledge.references).map(text).filter(value => value !== undefined)),
  ].filter(value => value !== undefined);
  return fields.length
    ? html`<h3>Knowledge</h3><pb-key-value prose .items=${fields}></pb-key-value>` : nothing;
}

function memberRow(member: RegisteredRuleSetVersion['members'][number], role: string) {
  const label = `${member.id} ${member.version}`;
  return {
    key: JSON.stringify([member.source, member.path, member.id, member.version]),
    label,
    role,
    cells: [
      html`<a data-route href=${rulePath(member, member.version)}>${label}</a>
        ${member.enabled ? nothing : html`<div part="member-status" class="meta">Disabled</div>`}`,
      role,
    ],
  };
}

const memberColumns: DataTableColumn<ReturnType<typeof memberRow>>[] = [
  { label: 'Rule', part: 'member-rule', compare: (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) },
  { label: 'Role', part: 'member-role', compare: (a, b) => a.role.localeCompare(b.role) },
];

function memberList(version: RegisteredRuleSetVersion) {
  const roles = new Map<string, string>();
  for (const entry of entries(version.knowledge?.rules)) {
    const record = object(entry);
    const id = text(record?.rule);
    const role = text(record?.role);
    if (id && role) roles.set(id, role);
  }
  return html`
    <h3>Members</h3>
    ${version.members.length ? html`<pb-data-table label="Member rules" .columns=${memberColumns}
      row-header-column="0" .rows=${version.members.map(member => memberRow(member, roles.get(member.id) ?? ''))}>
    </pb-data-table>` : html`<p>No member rules are registered for this version.</p>`}
  `;
}

function repositoryList(repositories: RuleSetCompliance[]) {
  return html`
    <section aria-labelledby="repositories">
      <pb-section><h2 slot="heading" id="repositories">Repositories at check</h2></pb-section>
      ${repositories.length ? html`<ul class="repositories" role="list">
        ${repositories.map(binding => html`<li>
          <pb-widget .heading=${binding.repository} heading-level="3">
            <div slot="metadata" class="binding">
              <span>Version ${binding.version}</span>
              <pb-status-pill .status=${binding.complete ? 'Complete' : 'Incomplete'}></pb-status-pill>
            </div>
            ${!binding.registered ? html`<p>Version is unregistered.</p>` : nothing}
            ${!binding.complete && binding.non_passing_members.length ? html`<ul class="non-passing" aria-label="Non-passing rules">
              ${binding.non_passing_members.map(member => html`<li>
                <a data-route href=${rulePath(member, member.version)}>${member.id} ${member.version}</a>
                <pb-status-pill .status=${member.status}></pb-status-pill>
              </li>`)}
            </ul>` : nothing}
          </pb-widget>
        </li>`)}
      </ul>` : html`<p>No repositories currently apply this Rule Set at check.</p>`}
    </section>`;
}

export class RuleSetView extends CockpitView<RuleSetDetail> {
  static override properties = {
    search: { attribute: false }, requestedVersion: { attribute: false },
  };

  static override styles = [CockpitView.styles as CSSResult, versionSelectorStyles, css`
    @layer components {
      .plain-text { white-space: pre-wrap; }
      :host { overflow-wrap: anywhere; }
      pb-widget, section { margin-block-start: var(--space-4); }
      h3 { margin-block: var(--space-4) 0; }
      article > h3:first-child { margin-block-start: 0; }
      .binding {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-3);
      }
      pb-data-table::part(member-rule) { min-inline-size: 10ch; }
      pb-data-table::part(member-role) { white-space: pre-wrap; }
      pb-key-value { margin-block-start: var(--space-2); }
      .repositories { list-style: none; padding: 0; }
      .non-passing { margin-block-end: 0; padding-inline-start: var(--space-4); }
      .non-passing li + li { margin-block-start: var(--space-2); }
    }
  `];

  declare search: string;
  declare requestedVersion: string | null;

  protected override async read(signal: AbortSignal): Promise<RuleSetDetail> {
    const query = new URLSearchParams(this.search);
    const versions = await registeredRuleSetVersions(query, signal);
    const repositories = await ruleSetCompliance(versions[0], signal);
    return { versions, repositories };
  }

  protected override heading(data?: RuleSetDetail) {
    const selected = selectedVersion(data?.versions, this.requestedVersion);
    return selected ? ruleSetLabel(selected.name || selected.id, selected.version) : 'Registered Rule Set';
  }

  protected override content(data?: RuleSetDetail) {
    const selected = selectedVersion(data?.versions, this.requestedVersion);
    const latest = selected === data?.versions.at(-1);
    return html`
      ${selected?.description ? html`<p class="plain-text">${selected.description}</p>` : nothing}
      <p><a data-route href="/rules">Back to registered rules</a></p>
      ${data && selected ? html`
        ${this.requestedVersion !== null && selected.version !== this.requestedVersion
          ? html`<p>Version <code>${this.requestedVersion}</code> is unavailable.</p>` : nothing}
        ${versionSelector(this, data.versions, selected)}
        <pb-widget .heading=${`Version ${selected.version}`} ?accent=${latest}>
          <div slot="metadata" class="binding">
            ${latest ? html`<pb-badge>Latest</pb-badge>` : nothing}
            <span class="registered meta">Registered <pb-time .value=${selected.registered_at}></pb-time></span>
          </div>
          <article>
            ${knowledgeDocument(selected.knowledge)}
            ${memberList(selected)}
          </article>
        </pb-widget>
        ${repositoryList(data.repositories)}
      ` : nothing}
    `;
  }
}

customElements.define('pb-rule-set', RuleSetView);
