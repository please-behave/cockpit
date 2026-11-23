import { css, html, LitElement } from 'lit';
import { formatTime } from './pb-time';
import './pb-tooltip';

const tick = 30_000;

export function relativeTime(then: Date, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  const units = [[86_400, 'day'], [3_600, 'hour'], [60, 'minute']] as const;
  for (const [size, unit] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${unit}${count === 1 ? '' : 's'} ago`;
    }
  }
  return 'just now';
}

export class RelativeTime extends LitElement {
  static override properties = { value: { type: String } };

  static override styles = css`
    @layer components {
      :host {
        overflow-wrap: anywhere;
      }
    }
  `;

  declare value: string;
  private timer?: number;

  constructor() {
    super();
    this.value = '';
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
    if (Number.isNaN(date.getTime())) return html`<span>${this.value}</span>`;

    return html`<pb-tooltip .description=${formatTime(date)}><time
      datetime=${this.value}>${relativeTime(date, new Date())}</time></pb-tooltip>`;
  }
}

customElements.define('pb-relative-time', RelativeTime);
