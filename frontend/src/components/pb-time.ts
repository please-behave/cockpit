import { css, html, LitElement } from 'lit';
import { linkStyles } from '../styles/links';
import './pb-tooltip';

const localTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
});

const zonedTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'long',
});

export function describeTime(date: Date, value?: string) {
  // Date only retains milliseconds. Keep the source's fractional seconds in UTC.
  const fraction = value?.match(/T\d{2}:\d{2}:\d{2}(\.\d+)(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1];
  const iso = date.toISOString();
  const utc = fraction ? iso.replace(/\.\d{3}Z$/, `${fraction}Z`) : iso;
  return `${zonedTime.format(date)} · ${utc} (UTC)`;
}

export class CockpitTime extends LitElement {
  static override properties = { value: { type: String }, href: { type: String } };

  static override styles = css`
    ${linkStyles}

    @layer components {
      :host {
        overflow-wrap: anywhere;
      }
    }
  `;

  declare value: string;
  declare href: string;

  constructor() {
    super();
    this.value = '';
    this.href = '';
  }

  override render() {
    const date = new Date(this.value);
    if (Number.isNaN(date.getTime())) {
      return this.href ? html`<a data-route href=${this.href}>${this.value}</a>` : html`<span>${this.value}</span>`;
    }

    const time = html`<time datetime=${this.value}>${localTime.format(date)}</time>`;
    const description = describeTime(date, this.value);
    if (this.href) {
      return html`<pb-tooltip external-trigger .description=${description}>
        <a data-route href=${this.href} aria-description=${description}>${time}</a></pb-tooltip>`;
    }
    return html`<pb-tooltip .description=${description}>${time}</pb-tooltip>`;
  }
}

customElements.define('pb-time', CockpitTime);
