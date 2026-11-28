import { css, html, LitElement } from 'lit';
import { linkStyles } from '../styles/links';
import { describeTime } from './pb-time';
import './pb-tooltip';

const tick = 30_000;

export function relativeTime(then: Date, now: Date, duration = false): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  const units = [[86_400, 'day'], [3_600, 'hour'], [60, 'minute']] as const;
  for (const [size, unit] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${unit}${count === 1 ? '' : 's'}${duration ? '' : ' ago'}`;
    }
  }
  return duration ? 'less than a minute' : 'just now';
}

export class RelativeTime extends LitElement {
  static override properties = { value: { type: String }, duration: { type: Boolean }, href: { type: String } };

  static override styles = [linkStyles, css`
    @layer components {
      :host {
        overflow-wrap: anywhere;
      }
    }
  `];

  declare value: string;
  declare duration: boolean;
  declare href?: string;
  private timer?: number;

  constructor() {
    super();
    this.value = '';
    this.duration = false;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.timer = window.setInterval(() => this.requestUpdate(), tick);
  }

  override disconnectedCallback() {
    window.clearInterval(this.timer);
    super.disconnectedCallback();
  }

  override render() {
    const date = new Date(this.value);
    if (Number.isNaN(date.getTime())) {
      return this.href ? html`<a data-route href=${this.href}>${this.value}</a>` : html`<span>${this.value}</span>`;
    }

    const time = html`<time datetime=${this.value}>${relativeTime(date, new Date(), this.duration)}</time>`;
    const description = describeTime(date, this.value);
    return this.href
      ? html`<pb-tooltip external-trigger .description=${description}>
          <a data-route href=${this.href} aria-description=${description}>${time}</a></pb-tooltip>`
      : html`<pb-tooltip .description=${description}>${time}</pb-tooltip>`;
  }
}

customElements.define('pb-relative-time', RelativeTime);
