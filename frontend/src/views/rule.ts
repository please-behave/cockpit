import { css, html, nothing, type CSSResult } from 'lit';
import { registeredVersions, type RegisteredVersion } from '../api/client';
import '../components/pb-time';
import { CockpitView } from './cockpit-view';
import { followHistoryBack, type AttestationOrigin } from './router';

const knowledgeFields = {
  purpose: 'Purpose',
  problem: 'Problem',
  value: 'Value',
  conditions: 'Conditions',
  success_criteria: 'Success criteria',
  out_of_scope: 'Out of scope',
  limitations: 'Limitations',
  placement: 'Placement',
  references: 'References',
} as const;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function knowledgeEntries(key: string, value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (key === 'conditions' || key === 'out_of_scope') {
      if (!item || typeof item !== 'object') return [];
      const statement = text(key === 'conditions' ? item.statement : item.description);
      if (!statement) return [];
      const reason = key === 'conditions' ? text(item.rationale) : text(item.owner);
      return [html`<li>${statement}${reason ? html`<div>${key === 'out_of_scope' ? 'Rule ' : ''}${reason}</div>` : nothing}</li>`];
    }
    const entry = text(item);
    return entry ? [html`<li>${entry}</li>`] : [];
  });
}

function knowledgeDocument(knowledge: Record<string, unknown> | undefined) {
  if (!knowledge) return nothing;
  const sections = Object.entries(knowledgeFields).flatMap(([key, label]) => {
    const value = knowledge[key];
    const paragraph = text(value);
    const entries = knowledgeEntries(key, value);
    if (!paragraph && entries.length === 0) return [];
    return [html`<div><dt>${label}</dt>
      <dd class="plain-text">${paragraph ?? html`<ul>${entries}</ul>`}</dd></div>`];
  });
  return sections.length > 0 ? html`<h3>Knowledge</h3><dl>${sections}</dl>` : nothing;
}

export class RuleView extends CockpitView<RegisteredVersion[]> {
  static override properties = { search: { attribute: false }, origin: { attribute: false } };
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      article {
        border-block-start: 1px solid var(--border);
        margin-block: var(--space-6);
        overflow-wrap: anywhere;
      }

      dl { margin-block: var(--space-4); }
      dl > div + div { margin-block-start: var(--space-3); }
      dt { font-weight: var(--weight-semibold); }
      dd { margin-inline-start: 0; }
      ul { margin-block: 0; }
      .plain-text { white-space: pre-wrap; }
      .identity { overflow-wrap: anywhere; }
    }
  `];

  declare search: string;
  declare origin?: AttestationOrigin;
  private positioned = false;

  private get requestedVersion() {
    return new URLSearchParams(this.search).get('version');
  }

  protected override read(signal: AbortSignal) {
    const identity = new URLSearchParams(this.search);
    identity.delete('version');
    return registeredVersions(identity, signal);
  }

  protected override heading(versions?: RegisteredVersion[]) {
    const latest = versions?.at(-1);
    return latest ? latest.name || latest.id : 'Registered rule';
  }

  protected override updated() {
    super.updated();
    if (this.positioned) return;
    const target = this.renderRoot.querySelector<HTMLElement>('[data-requested-version]');
    if (!target) return;
    this.positioned = true;
    target.focus({ preventScroll: true });
    target.scrollIntoView();
  }

  protected override content(versions?: RegisteredVersion[]) {
    const latest = versions?.at(-1);
    const requested = this.requestedVersion;
    return html`
      <p>${this.origin
        ? html`<a href=${this.origin.attestationPath} @click=${followHistoryBack}>Back to attestation</a>`
        : html`<a data-route href="/rules">Back to registered rules</a>`}</p>
      ${latest ? html`
        <p class="identity"><code>${latest.source}</code> · <code>${latest.path}</code> · <code>${latest.id}</code></p>
        ${requested !== null && !versions?.some(version => version.version === requested)
          ? html`<p>Version <code>${requested}</code> is unavailable.</p>` : nothing}
        ${versions?.slice().reverse().map(version => this.version(version, requested))}
      ` : nothing}
    `;
  }

  private version(version: RegisteredVersion, requested: string | null) {
    return html`
      <article>
        <h2 tabindex="-1" ?data-requested-version=${version.version === requested}>Version ${version.version}</h2>
        <dl>
          ${version.name ? html`<div><dt>Name</dt><dd class="plain-text">${version.name}</dd></div>` : nothing}
          <div><dt>Kind</dt><dd>${version.kind}</dd></div>
          <div><dt>Registered</dt><dd><pb-time .value=${version.registered_at}></pb-time></dd></div>
          ${version.description ? html`<div><dt>Description</dt><dd class="plain-text">${version.description}</dd></div>` : nothing}
          ${version.kind === 'review' ? html`
            <div><dt>Blocking</dt><dd>${version.blocking ? 'Yes' : 'No'}</dd></div>
            <div><dt>Prompt</dt><dd class="plain-text">${version.prompt}</dd></div>
          ` : nothing}
        </dl>
        ${knowledgeDocument(version.knowledge)}
      </article>
    `;
  }
}

customElements.define('pb-rule', RuleView);
