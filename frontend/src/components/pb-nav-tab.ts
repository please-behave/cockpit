import { css, html, LitElement, nothing } from 'lit';

export class NavTab extends LitElement {
  static override properties = {
    href: { type: String },
    active: { type: Boolean, reflect: true },
  };

  static override styles = css`
    @layer tokens, base, components, utilities;

    @layer components {
      :host {
        display: flex;
      }

      a {
        --segment-hover: var(--nav-hover-surface);

        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        min-block-size: var(--target-min-size);
        box-sizing: border-box;
        padding: var(--space-1) var(--control-padding-inline);
        background: var(--surface-raised);
        color: var(--link);
        text-decoration: none;
      }

      a[aria-current="page"] {
        --segment-hover: var(--nav-current-hover-surface);

        background: var(--surface);
        color: var(--nav-current-text);
        font-weight: var(--weight-semibold);
      }

      a:hover {
        background: var(--segment-hover);
        outline: 1px solid var(--border);
        outline-offset: -1px;
      }

      a:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-2 * var(--focus-offset));
      }
    }
  `;

  declare href: string;
  declare active: boolean;

  override render() {
    return html`
      <a data-route href=${this.href} aria-current=${this.active ? 'page' : nothing}><slot></slot></a>
    `;
  }
}

customElements.define('pb-nav-tab', NavTab);
