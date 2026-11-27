import { css, LitElement } from 'lit';
import { html, literal } from 'lit/static-html.js';
import type { SectionLink } from './pb-section';
import './pb-section';

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

  static override styles = css`
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

      .heading:focus-visible, ::slotted(:focus-visible) {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }
    }
  `;

  declare heading: string;
  declare headingLevel: keyof typeof headingTags;
  declare count?: number;
  declare link?: SectionLink;
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
        <pb-section .count=${this.count} .link=${this.link}>
          <${tag} slot="heading" id="widget-heading" class="heading" tabindex="-1"><slot name="heading">${this.heading}</slot></${tag}>
          <slot name="metadata" slot="metadata"></slot>
        </pb-section>
        <slot></slot>
      </section>
    `;
  }
}

customElements.define('pb-widget', Widget);
