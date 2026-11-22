import { html, LitElement } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { routeFor, Router, type Origin } from '../views/router';
import '../views/dashboard';
import '../views/detail';
import '../views/history';
import '../views/not-found';
import './app-shell';

export class CockpitApp extends LitElement {
  static override properties = { path: { state: true }, origin: { state: true } };
  declare private path: string;
  declare private origin?: Origin;

  private readonly router = new Router(this, (path, origin) => {
    this.path = path;
    this.origin = origin;
  });

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
      case 'history': return html`<pb-history></pb-history>`;
      case 'detail': return html`<pb-attestation .attestationId=${route.id} .origin=${this.origin}></pb-attestation>`;
      case 'not-found': return html`<pb-not-found></pb-not-found>`;
    }
  }

  override render() {
    return html`
      <pb-app-shell>
        <a slot="navigation" data-route href="/">Dashboard</a>
        <a slot="navigation" data-route href="/attestations">Attestations</a>
        ${keyed(this.path, this.view())}
      </pb-app-shell>
    `;
  }
}

customElements.define('pb-app', CockpitApp);
