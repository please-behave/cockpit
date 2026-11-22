import { html, LitElement } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { routeFor, Router, type Origin } from '../views/router';
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
  private kept?: { view: Element; scroll: number };
  private restored?: Element;
  private restoredScroll?: number;

  private readonly router = new Router(this, (path, origin, traversal) => {
    this.keep(path, origin, traversal);
    this.path = path;
    this.origin = origin;
  });

  /** Holds the history view in memory while its detail page is shown and attaches it again on the way back. */
  private keep(path: string, origin?: Origin, traversal = false) {
    const target = routeFor(path).view;
    const leavingHistory = this.path !== undefined && routeFor(this.path).view === 'history';
    this.restored = undefined;
    if (target === 'detail' && origin === 'history' && leavingHistory) {
      const view = this.renderRoot.querySelector('pb-history');
      this.kept = view ? { view, scroll: window.scrollY } : undefined;
    } else if (target === 'history' && traversal && this.kept) {
      this.restored = this.kept.view;
      this.restoredScroll = this.kept.scroll;
      this.kept = undefined;
    } else {
      this.kept = undefined;
    }
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

  private view() {
    const route = routeFor(this.path);
    switch (route.view) {
      case 'dashboard': return html`<pb-dashboard></pb-dashboard>`;
      case 'history': return this.restored ?? html`<pb-history></pb-history>`;
      case 'detail': return html`<pb-attestation .attestationId=${route.id} .origin=${this.origin}></pb-attestation>`;
      case 'rules': return html`<pb-rules .search=${route.search}></pb-rules>`;
      case 'rule': return html`<pb-rule .search=${route.search}></pb-rule>`;
      case 'not-found': return html`<pb-not-found></pb-not-found>`;
    }
  }

  override render() {
    return html`
      <pb-app-shell>
        <a slot="navigation" data-route href="/">Dashboard</a>
        <a slot="navigation" data-route href="/attestations">Attestations</a>
        <a slot="navigation" data-route href="/rules">Rules</a>
        ${keyed(this.path, this.view())}
      </pb-app-shell>
    `;
  }
}

customElements.define('pb-app', CockpitApp);
