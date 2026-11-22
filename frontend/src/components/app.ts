import { html, LitElement } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { routeFor, Router } from '../views/router';
import '../views/detail';
import '../views/not-found';
import '../views/overview';
import './app-shell';

export class CockpitApp extends LitElement {
  static override properties = { path: { state: true } };
  declare private path: string;

  private readonly router = new Router(this, path => { this.path = path; });

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
      case 'overview': return html`<pb-overview></pb-overview>`;
      case 'detail': return html`<pb-attestation .attestationId=${route.id}></pb-attestation>`;
      case 'not-found': return html`<pb-not-found></pb-not-found>`;
    }
  }

  override render() {
    return html`
      <pb-app-shell>
        <a slot="navigation" data-route href="/">Overview</a>
        ${keyed(this.path, this.view())}
      </pb-app-shell>
    `;
  }
}

customElements.define('pb-app', CockpitApp);
