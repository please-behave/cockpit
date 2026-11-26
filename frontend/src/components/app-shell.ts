import { css, html, LitElement, nothing } from 'lit';
import logo from '../../brand/logo.svg';
import logoDark from '../../brand/logo-dark.svg';
import { linkStyles } from '../styles/links';
import type { RefreshState } from '../views/cockpit-view';
import type { Route } from '../views/router';
import './pb-nav-tab';
import './pb-refresh-status';
import './pb-theme-toggle';

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

      .tab-label {
        display: grid;
        grid-template-areas: "label";
      }

      .tab-label > span, .tab-label::after {
        grid-area: label;
      }

      /* Reserve the active label width on every route while keeping its weight distinct. */
      .tab-label::after {
        content: attr(data-label);
        visibility: hidden;
        font-weight: var(--weight-semibold);
      }

      .brand {
        font-size: var(--type-brand);
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

      .actions {
        align-items: center;
        justify-content: flex-end;
        gap: var(--space-2);
        margin-inline-start: auto;
        padding-inline: var(--space-2);
      }

      .sign-out {
        padding: var(--space-2);
      }

      .sign-out:hover {
        background: var(--surface-hover);
      }

      .actions :focus-visible {
        outline-offset: calc(-1 * var(--focus-offset));
      }

      .refresh-line, main {
        box-sizing: border-box;
        max-inline-size: var(--content-width);
        margin-inline: auto;
        padding-inline: var(--space-4);
      }

      .refresh-line {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        block-size: var(--space-8);
      }

      main {
        padding-block: var(--space-8);
      }

      /* The status line occupies the same space as the regular top padding. */
      .refresh-line + main {
        padding-block-start: 0;
      }

      /* Keep loading and error margins inside the view. */
      .refresh-line + main ::slotted(*) {
        display: flow-root;
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
    currentView: { attribute: false },
    refreshState: { state: true },
  };
  declare currentView: Route['view'];
  declare private refreshState?: RefreshState;

  private skipToMain(event: MouseEvent) {
    event.preventDefault();
    this.renderRoot.querySelector('main')?.focus();
  }

  private readonly refreshStateChanged = (event: Event) => {
    this.refreshState = (event as CustomEvent<RefreshState>).detail;
  };

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('refresh-state', this.refreshStateChanged);
  }

  override disconnectedCallback() {
    this.removeEventListener('refresh-state', this.refreshStateChanged);
    super.disconnectedCallback();
  }

  private navLabel(label: string) {
    return html`<span class="tab-label" data-label=${label}><span>${label}</span></span>`;
  }

  private refreshStatus() {
    const state = this.refreshState;
    if (this.currentView !== 'dashboard' && this.currentView !== 'history') return nothing;
    return html`
      <div class="refresh-line">
        ${state?.view.isConnected ? html`
          <pb-refresh-status .updatedAt=${state.updatedAt} .busy=${state.busy}
            @refresh=${() => state.view.refresh()}></pb-refresh-status>
        ` : nothing}
      </div>
    `;
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
              ${this.navLabel('Please Behave Dashboard')}
            </pb-nav-tab>
            <pb-nav-tab href="/attestations" .active=${this.currentView === 'history' || this.currentView === 'detail'}>
              ${this.navLabel('Attestations')}
            </pb-nav-tab>
            <pb-nav-tab href="/releases" .active=${['releases', 'repository', 'release'].includes(this.currentView)}>
              ${this.navLabel('Releases')}
            </pb-nav-tab>
            <pb-nav-tab href="/deployments" .active=${this.currentView === 'deployments'}>
              Deployments
            </pb-nav-tab>
            <pb-nav-tab href="/rules" .active=${['rules', 'rule', 'rule-set'].includes(this.currentView)}>
              ${this.navLabel('Rules')}
            </pb-nav-tab>
          </nav>
          <div class="actions">
            <pb-theme-toggle></pb-theme-toggle>
            <a class="sign-out" href="/sign-out">Sign out</a>
          </div>
        </div>
      </header>
      ${this.refreshStatus()}
      <main id="main-content" tabindex="-1"><slot></slot></main>
    `;
  }
}

customElements.define('pb-app-shell', CockpitAppShell);
