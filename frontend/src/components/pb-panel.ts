import { css, html, LitElement } from 'lit';

export class Panel extends LitElement {
  static override styles = css`
    @layer components {
      :host {
        display: block;
        padding: var(--panel-padding);
        border: 1px solid var(--panel-border);
        border-radius: var(--radius-panel);
        background: var(--panel-surface);
      }

      :host([accent]) {
        border-inline-start: var(--space-1) solid var(--brand-accent);
      }
    }
  `;

  override render() {
    return html`<slot></slot>`;
  }
}

customElements.define('pb-panel', Panel);
