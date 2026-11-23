import { css, html, LitElement } from 'lit';

export class Badge extends LitElement {
  static override styles = css`
    @layer components {
      :host {
        display: inline-block;
        box-sizing: border-box;
        max-inline-size: 100%;
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--badge-border);
        border-radius: var(--radius-control);
        background: var(--badge-surface);
        color: var(--text);
        font-size: 0.875rem;
        font-weight: var(--weight-semibold);
        line-height: var(--line-heading);
        overflow-wrap: anywhere;
      }
    }
  `;

  override render() {
    return html`<slot></slot>`;
  }
}

customElements.define('pb-badge', Badge);
