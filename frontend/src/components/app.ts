import { html, LitElement } from 'lit';

export class CockpitApp extends LitElement {
  override render() {
    return html`<h1>Please Behave Cockpit</h1>`;
  }
}

customElements.define('pb-app', CockpitApp);
