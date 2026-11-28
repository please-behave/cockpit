import { css, html, LitElement, nothing } from 'lit';
import type { CompletedRuleSet } from '../api/client';
import { ruleSetPath } from '../views/router';
import { ruleSetChipStyles, versionedName } from './pb-rule-set-chip';
import './pb-tooltip';

export const ruleSetListStyles = css`
  @layer components {
    .rule-sets {
      display: grid;
      gap: var(--space-2);
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      list-style: none;
    }
  }
`;

export function completedRuleSetChips(sets: readonly CompletedRuleSet[]) {
  return sets.length ? html`<ul class="rule-sets" role="list">
    ${sets.map(set => html`<li><pb-rule-set-chip wrap .label=${versionedName(set.name, set.version)}
      .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip></li>`)}
  </ul>` : nothing;
}

export class RuleSetSummary extends LitElement {
  static override properties = {
    sets: { attribute: false },
    href: { type: String },
  };

  static override styles = [ruleSetChipStyles, ruleSetListStyles, css`
    @layer components {
      :host { display: inline-block; }
      button.chip { font-family: inherit; cursor: pointer; }
    }
  `];

  declare sets: readonly CompletedRuleSet[];
  declare href?: string;

  constructor() {
    super();
    this.sets = [];
  }

  override render() {
    const { sets, href } = this;
    if (!sets.length) return nothing;

    const label = `${sets.length} Rule ${sets.length === 1 ? 'Set' : 'Sets'}`;
    return html`
      <pb-tooltip external-trigger interactive description="Completed Rule Sets">
        ${href ? html`<a class="chip" data-route href=${href}>${label}</a>`
          : html`<button class="chip" type="button">${label}</button>`}
        <div slot="preview">${completedRuleSetChips(sets)}</div>
      </pb-tooltip>
    `;
  }
}

customElements.define('pb-rule-set-summary', RuleSetSummary);
