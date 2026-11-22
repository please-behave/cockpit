import { html, LitElement } from 'lit';
import { statePanelStyles } from './state-panel';

export class EmptyState extends LitElement {
  static override properties = {
    heading: { type: String },
    message: { type: String },
  };

  static override styles = statePanelStyles;

  declare heading: string;
  declare message: string;

  constructor() {
    super();
    this.heading = 'No results';
    this.message = 'There is nothing to show yet.';
  }

  override render() {
    return html`<div class="panel"><h2>${this.heading}</h2><p>${this.message}</p></div>`;
  }
}

customElements.define('pb-empty-state', EmptyState);
