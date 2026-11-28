import { css, html, LitElement } from 'lit';
import './pb-tooltip';

export function ruleSetLabel(name: string, version: string) {
  return `${name} · ${version}`;
}

export const ruleSetChipStyles = css`
  @layer components {
    .chip {
      display: block;
      box-sizing: border-box;
      min-block-size: var(--target-min-size);
      min-inline-size: var(--target-min-size);
      padding: var(--space-1) var(--space-2);
      overflow: hidden;
      border: 1px solid var(--rule-set);
      border-radius: var(--radius-pill);
      background: var(--rule-set-surface);
      color: var(--rule-set-text);
      font-size: var(--type-meta);
      line-height: var(--line-meta);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    a.chip {
      text-decoration: underline;
      text-underline-offset: 0.15em;
    }

    @media (forced-colors: active) {
      a.chip { color: var(--accent-link); }
    }

    .chip:focus-visible {
      outline: var(--focus-ring);
      outline-offset: var(--focus-offset);
    }
  }
`;

export class RuleSetChip extends LitElement {
  static override properties = {
    label: { type: String },
    href: { type: String },
    wrap: { type: Boolean, reflect: true },
  };

  static override styles = [ruleSetChipStyles, css`
    @layer components {
      :host {
        display: block;
        max-inline-size: min(100%, 16rem);
      }

      pb-tooltip { display: block; }

      :host([wrap]) .chip {
        white-space: normal;
        overflow-wrap: anywhere;
      }
    }
  `];

  declare label: string;
  declare href: string;
  declare wrap: boolean;

  constructor() {
    super();
    this.label = '';
    this.href = '';
    this.wrap = false;
  }

  override render() {
    return html`<pb-tooltip external-trigger text-value .description=${this.label}>
      <a class="chip" data-route href=${this.href}>${this.label}</a>
    </pb-tooltip>`;
  }
}

customElements.define('pb-rule-set-chip', RuleSetChip);
