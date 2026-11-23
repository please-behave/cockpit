import { css, html, LitElement, nothing } from 'lit';
import { linkStyles } from '../styles/links';

export class NavTab extends LitElement {
  static override properties = {
    href: { type: String },
    active: { type: Boolean, reflect: true },
  };

  static override styles = css`
    ${linkStyles}

    @layer components {
      :host {
        display: flex;
      }

      a {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-4);
      }

      a:hover {
        background: var(--surface-hover);
        text-decoration-thickness: 0.125em;
      }

      a[aria-current="page"] {
        background: var(--nav-active-surface);
        color: var(--nav-active-text);
      }

      a:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-2 * var(--focus-offset));
      }

      a[aria-current="page"]:focus-visible {
        outline-color: var(--nav-active-text);
      }

      @media (forced-colors: active) {
        a[aria-current="page"] {
          forced-color-adjust: none;
        }
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
