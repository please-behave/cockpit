import { css, html, LitElement, type TemplateResult } from 'lit';
import { linkStyles } from '../styles/links';

export interface Fact {
  term: string;
  description: string | TemplateResult;
}

export class FactStrip extends LitElement {
  static override properties = { items: { attribute: false } };

  static override styles = css`
    ${linkStyles}

    @layer components {
      :host {
        display: block;
      }

      dl {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3) var(--space-6);
        margin: 0;
        overflow-wrap: anywhere;
      }

      dl > div {
        flex: 1 1 8rem;
        min-inline-size: 0;
      }

      dt {
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
        font-weight: var(--weight-semibold);
      }

      dd {
        margin-inline-start: 0;
      }
    }
  `;

  declare items: readonly Fact[];

  constructor() {
    super();
    this.items = [];
  }

  override render() {
    return html`
      <dl>${this.items.map(({ term, description }) => html`
        <div><dt>${term}</dt><dd>${description}</dd></div>
      `)}</dl>
    `;
  }
}

customElements.define('pb-fact-strip', FactStrip);
