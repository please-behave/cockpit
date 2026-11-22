import { html, LitElement } from 'lit';
import './app-shell';

export class CockpitApp extends LitElement {
  override render() {
    return html`
      <pb-app-shell>
        <a slot="navigation" href="/">Overview</a>
        <h1>Please Behave Cockpit</h1>
      </pb-app-shell>
    `;
  }
}

customElements.define('pb-app', CockpitApp);
