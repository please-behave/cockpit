import { css, html, LitElement, nothing } from 'lit';
import { linkStyles } from '../styles/links';

export interface SectionLink {
  href: string;
  label: string;
}

export class Section extends LitElement {
  static override properties = {
    count: { type: Number },
    link: { attribute: false },
  };

  static override styles = [linkStyles, css`
    @layer components {
      :host { display: block; min-inline-size: 0; overflow-wrap: anywhere; }

      div {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-3);
      }

      ::slotted([slot="heading"]) {
        min-inline-size: 0;
        margin: 0;
        font-size: var(--type-subsection);
        line-height: var(--line-heading);
      }

      ::slotted(h1), ::slotted(h2) { font-size: var(--type-section); }
      :host([compact]) ::slotted([slot="heading"]) { font-size: inherit; }

      .count, ::slotted([slot="count"]) {
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
        font-variant-numeric: tabular-nums;
      }

      a { margin-inline-start: auto; }
    }
  `];

  declare count?: number;
  declare link?: SectionLink;

  override render() {
    return html`<div>
      <slot name="heading"></slot>
      ${this.count == null ? nothing : html`<span class="count">${this.count}</span>`}
      <slot name="metadata"></slot>
      <slot name="count"></slot>
      ${this.link ? html`<a data-route href=${this.link.href}>${this.link.label}</a>` : nothing}
    </div>`;
  }
}

customElements.define('pb-section', Section);
