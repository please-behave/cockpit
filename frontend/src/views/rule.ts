import { css, html, nothing, type CSSResult } from 'lit';
import { registeredVersions, type RegisteredVersion } from '../api/client';
import { repositoryUrl } from '../commit-link';
import '../components/pb-badge';
import '../components/pb-fact-strip';
import { ruleSetLabel } from '../components/pb-rule-set-chip';
import { shortName } from '../components/pb-short-name';
import '../components/pb-time';
import '../components/pb-tooltip';
import '../components/pb-widget';
import type { Widget } from '../components/pb-widget';
import { blockingExplanations, explainValue } from '../components/value-explanations';
import { CockpitView } from './cockpit-view';
import { followHistoryBack, ruleSetPath, type AttestationOrigin } from './router';
import { selectedVersion, versionSelector, versionSelectorStyles } from './registry-version';

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
  return sections.length > 0 ? html`<h3>Knowledge</h3><dl class="knowledge definitions meta-terms">${sections}</dl>` : nothing;
}

export class RuleView extends CockpitView<RegisteredVersion[]> {
  static override properties = {
    search: { attribute: false }, requestedVersion: { attribute: false }, origin: { attribute: false },
  };
  static override styles = [CockpitView.styles as CSSResult, versionSelectorStyles, css`
    @layer components {
      pb-widget { margin-block: var(--space-4); }
      h3 { margin-block: 0; }
      article > dl:first-child { margin-block-start: 0; }
      dl { margin-block: var(--space-4); }
      dl:last-child { margin-block-end: 0; }
      dl > div + div { margin-block-start: var(--space-3); }
      dd { margin-inline-start: 0; }
      ul { margin-block: 0; padding-inline-start: var(--space-4); }
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
      }
      .introduction { overflow-wrap: anywhere; }
      pb-fact-strip { margin-block-start: var(--space-4); }

      .identity {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3) var(--space-6);
        overflow-wrap: anywhere;
      }

      .memberships {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
      }

      .memberships dd {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        min-inline-size: 0;
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

  protected override read(signal: AbortSignal) {
    return registeredVersions(new URLSearchParams(this.search), signal);
  }

  protected override heading(versions?: RegisteredVersion[]) {
    const selected = selectedVersion(versions, this.requestedVersion);
    return selected ? selected.name || selected.id : 'Registered rule';
  }

  protected override updated() {
    super.updated();
    if (this.positioned) return;
    const target = this.renderRoot.querySelector<Widget>('pb-widget');
    if (!target) return;
    this.positioned = true;
    if (!target.hasAttribute('data-requested-version')) return;
    // The view's initial heading focus runs when the update completes.
    void this.updateComplete.then(() => target.focusHeading());
  }

  protected override content(versions?: RegisteredVersion[]) {
    const selected = selectedVersion(versions, this.requestedVersion);
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
        ${versionSelector(this, versions, selected)}
        ${this.version(selected, requested, selected === latest)}
      ` : nothing}
    `;
  }

  private summary(version: RegisteredVersion) {
    const facts = [
      { term: 'Kind', description: html`<pb-badge tone=${version.kind}>${version.kind}</pb-badge>` },
    ];
    if (version.kind === 'review') {
      facts.push({ term: 'Blocking', description: this.blockingBadge(version.blocking) });
    }
    facts.push({ term: 'Registered', description: html`<pb-time .value=${version.registered_at}></pb-time>` });

    return html`
      ${version.description ? html`<p class="introduction plain-text">${version.description}</p>` : nothing}
      <pb-fact-strip .items=${facts}></pb-fact-strip>
      <dl class="identity definitions meta">
        <div><dt>Repository</dt><dd>
          <pb-tooltip text-value hint .description=${version.source} .visibleText=${shortName(version.source)}><code>${shortName(version.source)}</code></pb-tooltip>
        </dd></div>
        <div><dt>Path</dt><dd><code>${version.path}</code></dd></div>
        <div><dt>Rule ID</dt><dd><code>${version.id}</code></dd></div>
      </dl>
      ${this.memberships(version)}
    `;
  }

  private memberships(version: RegisteredVersion) {
    const sets = version.rule_sets ?? [];
    const repository = repositoryUrl(version.source);
    return html`
      <dl class="memberships definitions">
        <dt>Part of</dt>
        <dd>${sets.length > 0 ? sets.map(set => html`
          <pb-rule-set-chip .label=${ruleSetLabel(set.name || set.id, set.version)}
            .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip>
        `) : html`<pb-badge>${repository
          ? html`<pb-tooltip text-value external-trigger .description=${version.source}
            .visibleText=${shortName(version.source)}>
            <a href=${repository} aria-label=${version.source}>${shortName(version.source)}</a>
          </pb-tooltip>`
          : version.source}</pb-badge>`}</dd>
      </dl>
    `;
  }

  private blockingBadge(blocking: boolean | undefined) {
    const label = blocking ? 'Blocking' : 'Non-blocking';
    return explainValue(html`<pb-badge tone=${blocking ? 'blocking' : 'neutral'}>${label}</pb-badge>`,
      blockingExplanations, label);
  }

  private version(version: RegisteredVersion, requested: string | null, latest: boolean) {
    return html`
      <pb-widget .heading=${`Version ${version.version}`} ?accent=${latest}
        ?data-requested-version=${version.version === requested}>
        ${latest ? html`<pb-badge slot="metadata">Latest</pb-badge>` : nothing}
        <article>
          <dl class="definitions">
            ${version.name ? html`<div><dt>Name</dt><dd class="plain-text">${version.name}</dd></div>` : nothing}
            <div><dt>Kind</dt><dd><pb-badge tone=${version.kind}>${version.kind}</pb-badge></dd></div>
            <div><dt>Registered</dt><dd><pb-time .value=${version.registered_at}></pb-time></dd></div>
            ${version.owner !== undefined ? html`<div><dt>Owner</dt><dd class="plain-text">${version.owner}</dd></div>` : nothing}
            ${version.description ? html`<div><dt>Description</dt><dd class="plain-text">${version.description}</dd></div>` : nothing}
            ${version.kind === 'review' ? html`
              <div><dt>Blocking</dt><dd>${this.blockingBadge(version.blocking)}</dd></div>
              <div><dt>Prompt</dt><dd class="prompt panel plain-text">${version.prompt}</dd></div>
            ` : nothing}
          </dl>
          ${knowledgeDocument(version.knowledge)}
        </article>
      </pb-widget>
    `;
  }
}

customElements.define('pb-rule', RuleView);
