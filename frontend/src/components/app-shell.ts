import { css, html, LitElement } from 'lit';
import logo from '../../brand/logo.svg';
import logoDark from '../../brand/logo-dark.svg';

export class CockpitAppShell extends LitElement {
  static override styles = css`
    @layer tokens, base, components, utilities;

    @layer base {
      :focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }
    }

    @layer components {
      :host {
        display: block;
      }

      header {
        border-block-end: 1px solid var(--border);
        background: var(--surface-raised);
      }

      .bar, main {
        box-sizing: border-box;
        max-inline-size: var(--content-width);
        margin-inline: auto;
        padding-inline: var(--space-4);
      }

      .bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        column-gap: var(--space-4);
        row-gap: var(--space-2);
        padding-block: var(--space-2);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-size: var(--type-brand);
        font-weight: var(--weight-semibold);
        line-height: var(--line-heading);
      }

      picture {
        padding: 0.375rem;
      }

      img {
        display: block;
        block-size: max(32px, 2.5rem);
        inline-size: auto;
      }

      nav {
        display: flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        gap: var(--space-3);
      }

      a {
        color: inherit;
      }

      .sign-out {
        padding: var(--space-2);
      }

      main {
        padding-block: var(--space-8);
      }

      main:focus-visible {
        outline-offset: calc(-1 * var(--focus-offset));
      }
    }

    @layer utilities {
      .skip-link {
        position: absolute;
        z-index: 1;
        inset-block-start: var(--space-2);
        inset-inline-start: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: var(--surface);
      }

      .skip-link:not(:focus) {
        clip-path: inset(50%);
      }
    }
  `;

  private skipToMain(event: MouseEvent) {
    event.preventDefault();
    this.renderRoot.querySelector('main')?.focus();
  }

  override render() {
    return html`
      <a class="skip-link" href="#main-content" @click=${this.skipToMain}>Skip to content</a>
      <header>
        <div class="bar">
          <div class="brand">
            <picture>
              <source media="(prefers-color-scheme: dark)" srcset=${logoDark}>
              <img src=${logo} alt="">
            </picture>
            <span>Please Behave Cockpit</span>
          </div>
          <nav aria-label="Main"><slot name="navigation"></slot></nav>
          <slot name="last-updated"></slot>
          <a class="sign-out" href="/sign-out">Sign out</a>
        </div>
      </header>
      <main id="main-content" tabindex="-1"><slot></slot></main>
    `;
  }
}

customElements.define('pb-app-shell', CockpitAppShell);
