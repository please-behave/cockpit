import { css, html, nothing, type CSSResult, type TemplateResult } from 'lit';
import {
  registeredRuleSetVersions, ruleSetCompliance, type RegisteredRuleSetVersion, type RuleSetCompliance,
} from '../api/client';
import '../components/pb-badge';
import '../components/pb-panel';
import '../components/pb-status-pill';
import '../components/pb-time';
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
  return content ? html`<div><dt>${label}</dt><dd class="plain-text">${content}</dd></div>` : nothing;
}

function listField(label: string, values: (string | TemplateResult)[]) {
  return values.length ? html`<div><dt>${label}</dt><dd><ul>
    ${values.map(value => html`<li class="plain-text">${value}</li>`)}
  </ul></dd></div>` : nothing;
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
  ];
  return fields.some(value => value !== nothing)
    ? html`<h3>Knowledge</h3><dl class="knowledge">${fields}</dl>` : nothing;
}

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
    ${version.members.length ? html`<dl class="knowledge">
      ${version.members.map(member => html`<div>
        <dt><a data-route href=${rulePath(member, member.version)}>${member.id} ${member.version}</a></dt>
        <dd class="plain-text">${member.enabled ? nothing : html`<div class="muted">Disabled</div>`}${roles.get(member.id) ?? nothing}</dd>
      </div>`)}
    </dl>` : html`<p>No member rules are registered for this version.</p>`}
  `;
}

function repositoryList(repositories: RuleSetCompliance[]) {
  return html`
    <section aria-labelledby="repositories">
      <h2 id="repositories">Repositories at check</h2>
      ${repositories.length ? html`<ul class="repositories" role="list">
        ${repositories.map(binding => html`<li>
          <pb-panel>
            <div class="binding">
              <strong>${binding.repository}</strong>
              <span>Version ${binding.version}</span>
              <span>${binding.complete ? 'Complete' : 'Incomplete'}</span>
            </div>
            ${!binding.registered ? html`<p>Version is unregistered.</p>` : nothing}
            ${!binding.complete && binding.non_passing_members.length ? html`<ul class="non-passing" aria-label="Non-passing rules">
              ${binding.non_passing_members.map(member => html`<li>
                <a data-route href=${rulePath(member, member.version)}>${member.id} ${member.version}</a>
                <pb-status-pill .status=${member.status}></pb-status-pill>
              </li>`)}
            </ul>` : nothing}
          </pb-panel>
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
      pb-panel, section { margin-block-start: var(--space-4); }
      h2, h3 { margin-block: 0; }
      h3 { margin-block-start: var(--space-4); }
      header, .binding {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-3);
      }
      .muted, .registered {
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
      }
      .knowledge { margin-block: var(--space-2) 0; }
      .knowledge > div + div { margin-block-start: var(--space-2); }
      .knowledge dt { font-weight: var(--weight-semibold); }
      dd { margin-inline-start: 0; }
      .knowledge ul, .non-passing { padding-inline-start: var(--space-4); }
      .knowledge ul { margin-block: 0; }
      .repositories { list-style: none; padding: 0; }
      .non-passing { margin-block-end: 0; }
      .non-passing li + li { margin-block-start: var(--space-2); }

      @media (min-width: 40rem) {
        .knowledge > div {
          display: grid;
          grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
          column-gap: var(--space-4);
          align-items: baseline;
        }
      }
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
    return selected ? selected.name || selected.id : 'Registered Rule Set';
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
        <pb-panel ?accent=${latest}>
          <article>
            <header>
              <h2>Version ${selected.version}</h2>
              ${latest ? html`<pb-badge>Latest</pb-badge>` : nothing}
              <span class="registered">Registered <pb-time .value=${selected.registered_at}></pb-time></span>
            </header>
            ${knowledgeDocument(selected.knowledge)}
            ${memberList(selected)}
          </article>
        </pb-panel>
        ${repositoryList(data.repositories)}
      ` : nothing}
    `;
  }
}

customElements.define('pb-rule-set', RuleSetView);
