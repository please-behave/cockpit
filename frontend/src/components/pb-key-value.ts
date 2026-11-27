import { css, html, LitElement, type TemplateResult } from 'lit';
import { linkStyles } from '../styles/links';

export interface KeyValueItem {
  term: string;
  description: string | TemplateResult;
  fullWidth?: boolean;
}

export class KeyValue extends LitElement {
  static override properties = { items: { attribute: false } };

  static override styles = [linkStyles, css`
    @layer components {
      :host { display: block; min-inline-size: 0; overflow-wrap: anywhere; }

      dl {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
        gap: var(--space-2) var(--space-4);
        margin: 0;
      }

      dl > div { min-inline-size: 0; }
      .full-width { grid-column: 1 / -1; }
      dt { color: var(--text-muted); }
      dd { margin: 0; }
      ul { margin: 0; padding-inline-start: var(--space-4); }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
        padding: 0;
        list-style: none;
      }

      .chips > li { max-inline-size: 100%; }

      :host([prose]) { container-type: inline-size; }
      :host([prose]) dl { grid-template-columns: minmax(0, 1fr); }
      :host([prose]) dt { color: var(--text); font-weight: var(--weight-semibold); }
      :host([prose]) dd { white-space: pre-wrap; }

      @container (min-width: 30rem) {
        :host([prose]) dl > div {
          display: grid;
          grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
          gap: var(--space-4);
          align-items: baseline;
        }
      }
    }
  `];

  declare items: readonly KeyValueItem[];

  constructor() {
    super();
    this.items = [];
  }

  override render() {
    return html`<dl>${this.items.map(({ term, description, fullWidth }) => html`
      <div class=${fullWidth ? 'full-width' : ''}><dt>${term}</dt><dd>${description}</dd></div>
    `)}</dl>`;
  }
}

customElements.define('pb-key-value', KeyValue);
