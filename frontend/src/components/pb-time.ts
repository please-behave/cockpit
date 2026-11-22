import { css, html, LitElement } from 'lit';

const localTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'long',
});

export class CockpitTime extends LitElement {
  static override properties = { value: { type: String } };

  static override styles = css`
    @layer components {
      :host {
        overflow-wrap: anywhere;
      }
    }
  `;

  declare value: string;

  constructor() {
    super();
    this.value = '';
  }

  override render() {
    const date = new Date(this.value);
    if (Number.isNaN(date.getTime())) return html`<span>${this.value}</span>`;

    return html`<time datetime=${this.value} title=${this.value}>${localTime.format(date)}</time>`;
  }
}

customElements.define('pb-time', CockpitTime);
