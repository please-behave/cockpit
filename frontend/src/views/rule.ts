import { css, html, nothing, type CSSResult } from 'lit';
import { live } from 'lit/directives/live.js';
import { registeredVersions, type RegisteredVersion } from '../api/client';
import '../components/pb-badge';
import '../components/pb-fact-strip';
import '../components/pb-panel';
import { shortName } from '../components/pb-short-name';
import '../components/pb-time';
import '../components/pb-tooltip';
import { CockpitView } from './cockpit-view';
import { followHistoryBack, type AttestationOrigin } from './router';

const optionTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

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
  return sections.length > 0 ? html`<h3>Knowledge</h3><dl class="knowledge">${sections}</dl>` : nothing;
}

export class RuleView extends CockpitView<RegisteredVersion[]> {
  static override properties = {
    search: { attribute: false }, requestedVersion: { attribute: false }, origin: { attribute: false },
  };
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      pb-panel {
        margin-block: var(--space-4);
        overflow-wrap: anywhere;
      }

      header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2) var(--space-3);
      }

      h2, h3 { margin-block: 0; }
      dl { margin-block: var(--space-4); }
      dl:last-child { margin-block-end: 0; }
      dl > div + div { margin-block-start: var(--space-3); }
      dt { font-weight: var(--weight-semibold); }
      dd { margin-inline-start: 0; }
      ul { margin-block: 0; padding-inline-start: var(--space-4); }
      .knowledge dt {
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      @media (min-width: 40rem) {
        .knowledge > div {
          display: grid;
          grid-template-columns: 9rem minmax(0, 1fr);
          column-gap: var(--space-4);
          align-items: baseline;
        }
      }

      .plain-text { white-space: pre-wrap; }
      .prompt {
        margin-block-start: var(--space-1);
        padding: var(--space-3);
        border: 1px solid var(--panel-border);
        border-radius: var(--radius-control);
        background: var(--surface);
      }
      .introduction { overflow-wrap: anywhere; }
      pb-fact-strip { margin-block-start: var(--space-4); }

      .version-field {
        display: flex;
        flex-direction: column;
        align-items: start;
        gap: var(--space-1);
      }

      .version-field select {
        max-inline-size: 100%;
        min-block-size: 2.75rem;
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--panel-border);
        border-radius: var(--radius-control);
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }

      .identity {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3) var(--space-6);
        color: var(--text-muted);
        font-size: 0.875rem;
        overflow-wrap: anywhere;
      }

      .identity > div {
        flex: 1 1 10rem;
        min-inline-size: 0;
        margin: 0;
      }
    }
  `];

  declare search: string;
  declare requestedVersion: string | null;
  declare origin?: AttestationOrigin;
  private positioned = false;

  private selection(versions?: RegisteredVersion[]) {
    return versions?.find(version => version.version === this.requestedVersion) ?? versions?.at(-1);
  }

  protected override read(signal: AbortSignal) {
    return registeredVersions(new URLSearchParams(this.search), signal);
  }

  protected override heading(versions?: RegisteredVersion[]) {
    const selected = this.selection(versions);
    return selected ? selected.name || selected.id : 'Registered rule';
  }

  protected override updated() {
    super.updated();
    if (this.positioned) return;
    const target = this.renderRoot.querySelector<HTMLElement>('article h2');
    if (!target) return;
    this.positioned = true;
    if (!target.hasAttribute('data-requested-version')) return;
    // The view's initial heading focus runs when the update completes.
    void this.updateComplete.then(() => {
      if (!target.isConnected) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView();
    });
  }

  protected override content(versions?: RegisteredVersion[]) {
    const selected = this.selection(versions);
    const latest = versions?.at(-1);
    const requested = this.requestedVersion;
    return html`
      ${selected ? this.summary(selected) : nothing}
      <p>${this.origin
        ? html`<a href=${this.origin.attestationPath} @click=${followHistoryBack}>Back to attestation</a>`
        : html`<a data-route href="/rules">Back to registered rules</a>`}</p>
      ${selected && versions ? html`
        ${requested !== null && selected.version !== requested
          ? html`<p>Version <code>${requested}</code> is unavailable.</p>` : nothing}
        ${versions.length > 1 ? this.selector(versions, selected) : nothing}
        ${this.version(selected, requested, selected === latest)}
      ` : nothing}
    `;
  }

  private selector(versions: RegisteredVersion[], selected: RegisteredVersion) {
    const latest = versions.at(-1);
    return html`<label class="version-field">
      Version
      <select @change=${this.changeVersion}>
        ${versions.slice().reverse().map(version => {
          const date = new Date(version.registered_at);
          const time = Number.isNaN(date.getTime()) ? version.registered_at : optionTime.format(date);
          const label = `${version.version} · ${time}${version === latest ? ' · Latest' : ''}`;
          return html`<option value=${version.version} .selected=${live(version === selected)}>${label}</option>`;
        })}
      </select>
    </label>`;
  }

  private changeVersion(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    this.dispatchEvent(new CustomEvent('version-change', { detail: select.value }));
  }

  private summary(version: RegisteredVersion) {
    const facts = [
      { term: 'Kind', description: html`<pb-badge>${version.kind}</pb-badge>` },
    ];
    if (version.kind === 'review') {
      facts.push({ term: 'Blocking', description: this.blockingBadge(version.blocking) });
    }
    facts.push({ term: 'Registered', description: html`<pb-time .value=${version.registered_at}></pb-time>` });

    return html`
      ${version.description ? html`<p class="introduction plain-text">${version.description}</p>` : nothing}
      <pb-fact-strip .items=${facts}></pb-fact-strip>
      <dl class="identity">
        <div><dt>Repository</dt><dd>
          <pb-tooltip hint .description=${version.source}><code>${shortName(version.source)}</code></pb-tooltip>
        </dd></div>
        <div><dt>Path</dt><dd><code>${version.path}</code></dd></div>
        <div><dt>Rule ID</dt><dd><code>${version.id}</code></dd></div>
      </dl>
    `;
  }

  private blockingBadge(blocking: boolean | undefined) {
    return html`<pb-badge>${blocking ? 'Blocking' : 'Non-blocking'}</pb-badge>`;
  }

  private version(version: RegisteredVersion, requested: string | null, latest: boolean) {
    return html`
      <pb-panel ?accent=${latest}>
        <article>
          <header>
            <h2 tabindex="-1" ?data-requested-version=${version.version === requested}>Version ${version.version}</h2>
            ${latest ? html`<pb-badge>Latest</pb-badge>` : nothing}
          </header>
          <dl>
            ${version.name ? html`<div><dt>Name</dt><dd class="plain-text">${version.name}</dd></div>` : nothing}
            <div><dt>Kind</dt><dd><pb-badge>${version.kind}</pb-badge></dd></div>
            <div><dt>Registered</dt><dd><pb-time .value=${version.registered_at}></pb-time></dd></div>
            ${version.description ? html`<div><dt>Description</dt><dd class="plain-text">${version.description}</dd></div>` : nothing}
            ${version.kind === 'review' ? html`
              <div><dt>Blocking</dt><dd>${this.blockingBadge(version.blocking)}</dd></div>
              <div><dt>Prompt</dt><dd class="prompt plain-text">${version.prompt}</dd></div>
            ` : nothing}
          </dl>
          ${knowledgeDocument(version.knowledge)}
        </article>
      </pb-panel>
    `;
  }
}

customElements.define('pb-rule', RuleView);
