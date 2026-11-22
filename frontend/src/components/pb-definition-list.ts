import { css, html, LitElement, type TemplateResult } from 'lit';

export interface Definition {
  term: string;
  description: string | TemplateResult;
}

export class DefinitionList extends LitElement {
  static override properties = { items: { attribute: false } };

  static override styles = css`
    @layer components {
      :host {
        display: block;
      }

      dl {
        margin: 0;
        overflow-wrap: anywhere;
      }

      div + div {
        margin-block-start: var(--space-3);
      }

      dt {
        font-weight: var(--weight-semibold);
      }

      dd {
        margin-inline-start: 0;
      }
    }
  `;

  declare items: readonly Definition[];

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

customElements.define('pb-definition-list', DefinitionList);
