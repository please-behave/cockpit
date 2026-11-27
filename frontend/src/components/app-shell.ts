import { css, html, LitElement, nothing } from 'lit';
import logo from '../../brand/logo.svg';
import logoDark from '../../brand/logo-dark.svg';
import { controlStyles } from '../styles/controls';
import { linkStyles } from '../styles/links';
import type { RefreshState } from '../views/cockpit-view';
import type { Route } from '../views/router';
import './pb-nav-tab';
import './pb-refresh-status';
import './pb-theme-toggle';

export class CockpitAppShell extends LitElement {
  static override styles = css`
    ${linkStyles}
    ${controlStyles}

    @layer base {
      :focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }
    }

    @layer components {
      :host {
        display: flex;
        flex-direction: column;
        min-block-size: 100svh;
      }

      header {
        border-block-end: 1px solid var(--border-subtle);
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
        block-size: max(32px, var(--space-8));
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
        padding: var(--space-1) var(--control-padding-inline);
      }

      .sign-out:hover {
        background: var(--surface-hover);
      }

      .actions :focus-visible {
        outline-offset: calc(-1 * var(--focus-offset));
      }

      .toolbar, main, footer {
        box-sizing: border-box;
        max-inline-size: var(--content-width-detail);
        inline-size: 100%;
        margin-inline: auto;
        padding-inline: var(--space-4);
      }

      .toolbar, .wide {
        max-inline-size: var(--content-width-wide);
      }

      .toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        column-gap: var(--space-2);
        min-block-size: var(--space-8);
      }

      .view-controls {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
      }

      @media (max-width: 32rem) {
        .toolbar {
          grid-template-rows: minmax(var(--target-min-size), auto) minmax(var(--space-8), auto);
        }

        .view-controls { grid-column: 1 / -1; }
        pb-refresh-status { grid-column: 2; grid-row: 2; }
      }

      main {
        display: flow-root;
        padding-block-end: var(--space-8);
      }

      header:focus-visible, main:focus-visible {
        outline-offset: calc(-1 * var(--focus-offset));
      }

      .back-to-top {
        position: fixed;
        z-index: 2;
        inset-block-end: var(--space-2);
        inset-inline-end: var(--space-2);
        min-inline-size: var(--target-min-size);
      }

      footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-1) var(--space-3);
        margin-block-start: auto;
        padding-block: var(--space-2);
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
      }

      @media (forced-colors: none) {
        footer a:any-link { color: inherit; }
      }

      @media (max-width: 20rem) {
        footer span { flex-basis: 100%; }
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
    showBackToTop: { state: true },
  };
  declare currentView: Route['view'];
  declare private refreshState?: RefreshState;
  declare private showBackToTop?: boolean;

  private readonly updateBackToTop = () => {
    const viewport = this.ownerDocument.defaultView;
    this.showBackToTop = viewport !== null && viewport.scrollY >= viewport.innerHeight;
  };

  private backToTop() {
    const viewport = this.ownerDocument.defaultView;
    const reducedMotion = viewport?.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.renderRoot.querySelector('header')?.focus({ preventScroll: true });
    viewport?.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
  }

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
    const viewport = this.ownerDocument.defaultView;
    viewport?.addEventListener('scroll', this.updateBackToTop, { passive: true });
    viewport?.addEventListener('resize', this.updateBackToTop);
    this.updateBackToTop();
  }

  override disconnectedCallback() {
    this.removeEventListener('refresh-state', this.refreshStateChanged);
    const viewport = this.ownerDocument.defaultView;
    viewport?.removeEventListener('scroll', this.updateBackToTop);
    viewport?.removeEventListener('resize', this.updateBackToTop);
    super.disconnectedCallback();
  }

  private navLabel(label: string) {
    return html`<span class="tab-label" data-label=${label}><span>${label}</span></span>`;
  }

  private refreshStatus(state: RefreshState | undefined) {
    if (!state) return nothing;
    return html`
      <pb-refresh-status .updatedAt=${state.updatedAt} .busy=${state.busy}
        .interval=${state.interval} .cycleStart=${state.cycleStart}
        @refresh=${() => state.view.refresh()}
        @interval-change=${(event: CustomEvent<number>) => state.view.setRefreshInterval(event.detail)}>
      </pb-refresh-status>
    `;
  }

  override render() {
    const refresh = this.refreshState?.view.isConnected ? this.refreshState : undefined;
    const wide = ['dashboard', 'history', 'releases', 'deployments', 'rules'].includes(this.currentView);
    return html`
      <a class="skip-link" href="#main-content" @click=${this.skipToMain}>Skip to content</a>
      <header tabindex="-1">
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
              ${this.navLabel('Deployments')}
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
      <div class="toolbar">
        <slot class="view-controls" name="toolbar">${refresh?.toolbar}</slot>
        ${this.refreshStatus(refresh)}
      </div>
      <main id="main-content" class=${wide ? 'wide' : nothing} tabindex="-1"><slot></slot></main>
      <footer role="contentinfo" class=${wide ? 'wide' : nothing}>
        <a href="https://github.com/please-behave" target="_blank" rel="noopener noreferrer">Please Behave</a>
        <span>© 2026 Please Behave</span>
      </footer>
      ${this.showBackToTop ? html`
        <button class="back-to-top" type="button" @click=${this.backToTop}>Back to top</button>
      ` : nothing}
    `;
  }
}

customElements.define('pb-app-shell', CockpitAppShell);
