import { css, html, LitElement } from 'lit';
import logo from '../../brand/logo.svg';
import logoDark from '../../brand/logo-dark.svg';
import { linkStyles } from '../styles/links';
import { chooseTheme, effectiveTheme, watchSystemTheme, type Theme } from '../theme';
import type { Route } from '../views/router';
import './pb-nav-tab';

export class CockpitAppShell extends LitElement {
  static override styles = css`
    ${linkStyles}

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

      .bar, nav, .actions {
        display: flex;
        flex-wrap: wrap;
      }

      nav {
        flex: 1 1 auto;
        min-inline-size: 0;
      }

      pb-nav-tab {
        flex: 1 0 auto;
        max-inline-size: 100%;
      }

      .brand {
        font-size: var(--type-brand);
        font-weight: var(--weight-semibold);
        line-height: var(--line-heading);
      }

      img {
        block-size: max(32px, 2.5rem);
        inline-size: auto;
      }

      .logo-light {
        display: var(--logo-light-display);
      }

      .logo-dark {
        display: var(--logo-dark-display);
      }

      .brand[active] .logo-light {
        display: var(--logo-dark-display);
      }

      .brand[active] .logo-dark {
        display: var(--logo-light-display);
      }

      .actions {
        align-items: center;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-inline-start: auto;
        padding-inline: var(--space-2);
      }

      .sign-out, .theme-toggle {
        padding: var(--space-2);
      }

      .theme-toggle {
        border: 0;
        background: var(--surface-raised);
        color: inherit;
        font: inherit;
        cursor: pointer;
      }

      .theme-toggle:hover, .sign-out:hover {
        background: var(--surface-hover);
      }

      .actions :focus-visible {
        outline-offset: calc(-1 * var(--focus-offset));
      }

      main {
        box-sizing: border-box;
        max-inline-size: var(--content-width);
        margin-inline: auto;
        padding-inline: var(--space-4);
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

  static override properties = {
    theme: { state: true },
    currentView: { attribute: false },
  };
  declare private theme: Theme;
  declare currentView: Route['view'];
  private unwatchSystemTheme?: () => void;

  constructor() {
    super();
    this.theme = effectiveTheme();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.theme = effectiveTheme();
    this.unwatchSystemTheme = watchSystemTheme(() => { this.theme = effectiveTheme(); });
  }

  override disconnectedCallback() {
    this.unwatchSystemTheme?.();
    super.disconnectedCallback();
  }

  private toggleTheme() {
    chooseTheme(this.theme === 'dark' ? 'light' : 'dark');
    this.theme = effectiveTheme();
  }

  private skipToMain(event: MouseEvent) {
    event.preventDefault();
    this.renderRoot.querySelector('main')?.focus();
  }

  override render() {
    return html`
      <a class="skip-link" href="#main-content" @click=${this.skipToMain}>Skip to content</a>
      <header>
        <div class="bar">
          <nav aria-label="Main">
            <pb-nav-tab class="brand" href="/" .active=${this.currentView === 'dashboard'}>
              <img class="logo-light" src=${logo} alt="">
              <img class="logo-dark" src=${logoDark} alt="">
              <span>Please Behave Cockpit</span>
            </pb-nav-tab>
            <pb-nav-tab href="/attestations" .active=${this.currentView === 'history' || this.currentView === 'detail'}>
              Attestations
            </pb-nav-tab>
            <pb-nav-tab href="/rules" .active=${this.currentView === 'rules' || this.currentView === 'rule'}>
              Rules
            </pb-nav-tab>
          </nav>
          <div class="actions">
            <slot name="last-updated"></slot>
            <button class="theme-toggle" type="button" @click=${this.toggleTheme}>
              ${this.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            </button>
            <a class="sign-out" href="/sign-out">Sign out</a>
          </div>
        </div>
      </header>
      <main id="main-content" tabindex="-1"><slot></slot></main>
    `;
  }
}

customElements.define('pb-app-shell', CockpitAppShell);
