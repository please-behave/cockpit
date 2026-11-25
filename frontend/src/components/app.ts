import { html, LitElement } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { routeFor, Router, type Origin, type Route } from '../views/router';
import '../views/dashboard';
import '../views/detail';
import '../views/history';
import '../views/not-found';
import '../views/rule';
import '../views/rules';
import './app-shell';

export class CockpitApp extends LitElement {
  static override properties = { path: { state: true }, origin: { state: true } };
  declare private path: string;
  declare private origin?: Origin;
  private kept?: { path: string; view: Element; scroll: number };
  private restored?: Element;
  private restoredScroll?: number;

  private readonly router = new Router(this, (path, origin, traversal) => {
    this.keep(path, origin, traversal);
    this.path = path;
    this.origin = origin;
  });

  /** Keep the view for the immediate return from its detail page. */
  private keep(path: string, origin?: Origin, traversal = false) {
    const target = routeFor(path);
    const current = this.path === undefined ? undefined : routeFor(this.path);
    if (target.view === 'rule' && current?.view === 'rule' && target.search === current.search) return;
    this.restored = undefined;
    if (traversal && this.kept?.path === path) {
      this.restored = this.kept.view;
      this.restoredScroll = this.kept.scroll;
      this.kept = undefined;
      return;
    }

    let view: Element | null = null;
    if (target.view === 'detail' && origin === 'history' && current?.view === 'history') {
      view = this.renderRoot.querySelector('pb-history');
    } else if (target.view === 'rule' && typeof origin === 'object' && origin.attestationPath === this.path) {
      view = this.renderRoot.querySelector('pb-attestation');
    }
    this.kept = view ? { path: this.path, view, scroll: window.scrollY } : undefined;
  }

  protected override updated() {
    if (this.restoredScroll === undefined) return;
    window.scrollTo(0, this.restoredScroll);
    this.restoredScroll = undefined;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.router.connect();
  }

  override disconnectedCallback() {
    this.router.disconnect();
    super.disconnectedCallback();
  }

  private view(route: Route) {
    switch (route.view) {
      case 'dashboard': return html`<pb-dashboard></pb-dashboard>`;
      case 'history': return this.restored ?? html`<pb-history></pb-history>`;
      case 'detail': return this.restored ?? html`<pb-attestation .attestationId=${route.id}
        .origin=${typeof this.origin === 'string' ? this.origin : undefined}></pb-attestation>`;
      case 'rules': return html`<pb-rules></pb-rules>`;
      case 'rule': return html`<pb-rule .search=${route.search} .requestedVersion=${route.version}
        @version-change=${this.selectRuleVersion}
        .origin=${typeof this.origin === 'object' ? this.origin : undefined}></pb-rule>`;
      case 'not-found': return html`<pb-not-found></pb-not-found>`;
    }
  }

  private selectRuleVersion(event: CustomEvent<string>) {
    this.router.selectRuleVersion(event.detail);
  }

  override render() {
    const route = routeFor(this.path);
    const key = route.view === 'rule' ? `/rules/detail?${route.search}` : this.path;
    return html`
      <pb-app-shell .currentView=${route.view}>
        ${keyed(key, this.view(route))}
      </pb-app-shell>
    `;
  }
}

customElements.define('pb-app', CockpitApp);
