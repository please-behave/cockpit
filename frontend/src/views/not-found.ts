import { html } from 'lit';
import { CockpitView } from './cockpit-view';

class NotFoundView extends CockpitView {
  protected override heading() {
    return 'Page not found';
  }

  protected override content() {
    return html`<p>There is no page at this address.</p><p><a data-route href="/">Back to overview</a></p>`;
  }
}

customElements.define('pb-not-found', NotFoundView);
