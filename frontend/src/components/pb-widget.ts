import { css, LitElement, nothing } from 'lit';
import { html, literal } from 'lit/static-html.js';
import { linkStyles } from '../styles/links';

const headingTags = {
  1: literal`h1`, 2: literal`h2`, 3: literal`h3`,
  4: literal`h4`, 5: literal`h5`, 6: literal`h6`,
} as const;

export class Widget extends LitElement {
  static override properties = {
    heading: { type: String },
    headingLevel: { type: Number, attribute: 'heading-level' },
    count: { type: Number },
    link: { attribute: false },
    accent: { type: Boolean, reflect: true },
  };

  static override styles = [linkStyles, css`
    @layer components {
      :host {
        display: block;
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }

      section {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
        padding: var(--panel-padding);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-panel);
        background: var(--panel-surface);
      }

      :host([accent]) section {
        border-inline-start: var(--space-1) solid var(--brand-accent);
      }

      header {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-1) var(--space-3);
      }

      .heading {
        min-inline-size: 0;
        margin: 0;
        font-size: var(--type-subsection);
        line-height: var(--line-heading);
      }

      h1.heading, h2.heading { font-size: var(--type-section); }

      .heading:focus-visible, ::slotted(:focus-visible) {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }

      .count {
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
        font-variant-numeric: tabular-nums;
      }

      a { margin-inline-start: auto; }
    }
  `];

  declare heading: string;
  declare headingLevel: keyof typeof headingTags;
  declare count?: number;
  declare link?: { href: string; label: string };
  declare accent: boolean;

  constructor() {
    super();
    this.heading = '';
    this.headingLevel = 2;
    this.accent = false;
  }

  async focusHeading() {
    await this.updateComplete;
    if (!this.isConnected) return;
    const heading = this.renderRoot.querySelector<HTMLElement>('.heading')!;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView();
  }

  override render() {
    const tag = headingTags[this.headingLevel] ?? headingTags[2];
    return html`
      <section aria-labelledby="widget-heading">
        <header>
          <${tag} id="widget-heading" class="heading" tabindex="-1"><slot name="heading">${this.heading}</slot></${tag}>
          ${this.count == null ? nothing : html`<span class="count">${this.count}</span>`}
          <slot name="metadata"></slot>
          ${this.link ? html`<a data-route href=${this.link.href}>${this.link.label}</a>` : nothing}
        </header>
        <slot></slot>
      </section>
    `;
  }
}

customElements.define('pb-widget', Widget);
