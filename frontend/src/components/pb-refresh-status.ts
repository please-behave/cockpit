import { css, html, LitElement, svg, type PropertyValues } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { defaultRefreshInterval, refreshIntervalLabel, refreshIntervals } from '../refresh-interval';
import { describeTime } from './pb-time';
import { relativeTime } from './pb-relative-time';
import './pb-tooltip';

const tick = 10_000;

export function updatedText(then: Date, now: Date): string {
  const seconds = (now.getTime() - then.getTime()) / 1000;
  return `Updated ${seconds < 60 ? 'a few seconds ago' : relativeTime(then, now)}`;
}

const refreshIcon = svg`
  <path d="M20 12a8 8 0 1 1-2.35-5.65"/>
  <path d="M20 4v5h-5"/>
`;

const ringSteps = 10;

/** The age of the data, the refresh button with a progress ring towards the next refresh and the interval menu. */
export class RefreshStatus extends LitElement {
  static override properties = {
    updatedAt: { attribute: false },
    busy: { type: Boolean },
    interval: { type: Number },
    cycleStart: { type: Number },
  };

  static override styles = css`
    @layer components {
      :host {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-inline-size: 0;
      }

      .controls {
        display: inline-flex;
        align-items: center;
      }

      button {
        position: relative;
        display: grid;
        place-items: center;
        inline-size: var(--space-8);
        aspect-ratio: 1;
        padding: 0;
        border: 0;
        background: var(--surface);
        color: inherit;
        cursor: pointer;
      }

      button:hover {
        background: var(--surface-hover);
      }

      button[aria-disabled='true'] {
        color: var(--text-muted);
        cursor: progress;
      }

      button:focus-visible {
        outline: var(--focus-ring);
        outline-offset: calc(-2 * var(--focus-offset));
      }

      svg.icon {
        inline-size: calc(var(--space-4) + var(--space-1));
        block-size: auto;
      }

      svg.ring {
        position: absolute;
        inset: 0;
        inline-size: 100%;
        block-size: 100%;
        transform: rotate(-90deg);
        pointer-events: none;
      }

      .ring circle {
        fill: none;
        stroke: var(--accent-fill);
        stroke-width: 2;
        stroke-dasharray: 100;
        stroke-dashoffset: 100;
        animation: fill var(--ring-duration, 0s) linear var(--ring-delay, 0s) 1 forwards;
      }

      @keyframes fill {
        to { stroke-dashoffset: 0; }
      }

      .interval {
        position: relative;
        display: grid;
        place-items: center;
        inline-size: var(--target-min-size);
        block-size: var(--space-8);
        background: var(--surface);
      }

      .interval:hover {
        background: var(--surface-hover);
      }

      .interval:has(select:focus-visible) {
        outline: var(--focus-ring);
        outline-offset: calc(-2 * var(--focus-offset));
      }

      .interval svg {
        inline-size: var(--space-3);
        block-size: auto;
        pointer-events: none;
      }

      select {
        position: absolute;
        inset: 0;
        inline-size: 100%;
        opacity: 0;
        cursor: pointer;
      }

      .busy svg.icon {
        color: var(--accent-fill);
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @media (forced-colors: active) {
        .busy svg.icon { color: inherit; }
        .ring circle { stroke: currentColor; }
      }

      @media (prefers-reduced-motion: reduce) {
        .busy svg.icon {
          animation: none;
        }

        .ring circle {
          animation-timing-function: steps(${ringSteps});
        }
      }

      time {
        font-size: var(--type-meta);
        line-height: var(--line-meta);
        color: var(--text-muted);
        white-space: nowrap;
      }
    }
  `;

  declare updatedAt: Date;
  declare busy: boolean;
  /** Milliseconds between two refreshes. */
  declare interval: number;
  /** Time in milliseconds since the epoch at which the current interval started. */
  declare cycleStart: number;
  private timer?: number;
  private ringDelay = 0;

  constructor() {
    super();
    this.updatedAt = new Date(NaN);
    this.busy = false;
    this.interval = defaultRefreshInterval;
    this.cycleStart = Date.now();
  }

  override connectedCallback() {
    super.connectedCallback();
    this.timer = window.setInterval(() => this.requestUpdate(), tick);
  }

  override disconnectedCallback() {
    window.clearInterval(this.timer);
    super.disconnectedCallback();
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('cycleStart') || changed.has('interval')) {
      this.ringDelay = -Math.min(Math.max(Date.now() - this.cycleStart, 0), this.interval);
    }
  }

  protected override updated() {
    const ring = this.renderRoot.querySelector<SVGElement>('.ring');
    ring?.style.setProperty('--ring-duration', `${this.interval}ms`);
    ring?.style.setProperty('--ring-delay', `${this.ringDelay}ms`);
  }

  private chooseInterval(event: Event) {
    const interval = Number((event.target as HTMLSelectElement).value);
    this.dispatchEvent(new CustomEvent<number>('interval-change', { detail: interval }));
  }

  private refresh() {
    if (!this.busy) this.dispatchEvent(new CustomEvent('refresh'));
  }

  override render() {
    return html`
      <pb-tooltip .description=${describeTime(this.updatedAt)}><time
        datetime=${this.updatedAt.toISOString()}>${updatedText(this.updatedAt, new Date())}</time></pb-tooltip>
      <span class="controls">
        <pb-tooltip external-trigger description="Refresh">
          <button type="button" class=${this.busy ? 'busy' : ''} aria-label="Refresh"
            aria-disabled=${this.busy ? 'true' : 'false'} @click=${this.refresh}>
            ${keyed(this.cycleStart, html`
              <svg class="ring" viewBox="0 0 32 32" aria-hidden="true">
                <circle cx="16" cy="16" r="15" pathLength="100"/>
              </svg>`)}
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${refreshIcon}</svg>
          </button>
        </pb-tooltip>
        <pb-tooltip external-trigger .description=${`Refresh every ${refreshIntervalLabel(this.interval)}`}>
          <span class="interval">
            <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4h8L6 9z"/></svg>
            <select aria-label="Refresh interval" @change=${this.chooseInterval}>
              ${refreshIntervals.map(value => html`
                <option value=${value} ?selected=${value === this.interval}>${refreshIntervalLabel(value)}</option>`)}
            </select>
          </span>
        </pb-tooltip>
      </span>
    `;
  }
}

customElements.define('pb-refresh-status', RefreshStatus);
