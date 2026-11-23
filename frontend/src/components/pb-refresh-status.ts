import { css, html, LitElement, svg } from 'lit';
import { formatTime } from './pb-time';
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

/** The button and the age of the data of a refreshable view, shown in the header. */
export class RefreshStatus extends LitElement {
  static override properties = {
    updatedAt: { attribute: false },
    busy: { type: Boolean },
  };

  static override styles = css`
    @layer components {
      :host {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-inline-size: 0;
      }

      button {
        display: grid;
        place-items: center;
        inline-size: calc(var(--space-8) + var(--space-3));
        aspect-ratio: 1;
        padding: 0;
        border: 0;
        background: var(--surface-raised);
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

      svg {
        inline-size: calc(var(--space-4) + var(--space-1));
        block-size: auto;
      }

      .busy svg {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @media (prefers-reduced-motion: reduce) {
        .busy svg {
          animation: none;
        }
      }

      time {
        color: var(--text-muted);
      }
    }
  `;

  declare updatedAt: Date;
  declare busy: boolean;
  private timer?: number;

  constructor() {
    super();
    this.updatedAt = new Date(NaN);
    this.busy = false;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.timer = window.setInterval(() => this.requestUpdate(), tick);
  }

  override disconnectedCallback() {
    window.clearInterval(this.timer);
    super.disconnectedCallback();
  }

  private refresh() {
    if (!this.busy) this.dispatchEvent(new CustomEvent('refresh'));
  }

  override render() {
    return html`
      <pb-tooltip .description=${formatTime(this.updatedAt)}><time
        datetime=${this.updatedAt.toISOString()}>${updatedText(this.updatedAt, new Date())}</time></pb-tooltip>
      <pb-tooltip external-trigger description="Refresh">
        <button type="button" class=${this.busy ? 'busy' : ''} aria-label="Refresh"
          aria-disabled=${this.busy ? 'true' : 'false'} @click=${this.refresh}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
               stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${refreshIcon}</svg>
        </button>
      </pb-tooltip>
    `;
  }
}

customElements.define('pb-refresh-status', RefreshStatus);
