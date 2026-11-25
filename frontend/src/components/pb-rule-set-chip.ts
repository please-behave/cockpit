import { css, html, LitElement } from 'lit';
import './pb-tooltip';

export class RuleSetChip extends LitElement {
  static override properties = {
    label: { type: String },
    truncated: { state: true },
  };

  static override styles = css`
    @layer components {
      :host {
        display: block;
        max-inline-size: min(100%, 16rem);
        pointer-events: none;
      }

      pb-tooltip {
        display: block;
        pointer-events: auto;
      }

      .chip {
        display: block;
        box-sizing: border-box;
        padding: var(--space-1) var(--space-2);
        overflow: hidden;
        border: 1px solid var(--rule-set);
        border-radius: 999px;
        background: var(--rule-set-surface);
        color: var(--rule-set-text);
        font-size: 0.875rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  `;

  declare label: string;
  protected declare truncated: boolean;

  private observer?: ResizeObserver;

  constructor() {
    super();
    this.label = '';
    this.truncated = false;
  }

  override connectedCallback() {
    super.connectedCallback();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer ??= new ResizeObserver(() => this.measure());
      this.observer.observe(this);
    }
  }

  override disconnectedCallback() {
    this.observer?.disconnect();
    super.disconnectedCallback();
  }

  protected override updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('label')) queueMicrotask(() => this.measure());
  }

  private measure() {
    const chip = this.renderRoot.querySelector('.chip');
    if (chip) this.truncated = chip.scrollWidth > chip.clientWidth;
  }

  override render() {
    const chip = html`<span class="chip">${this.label}</span>`;
    return this.truncated
      ? html`<pb-tooltip .description=${this.label}>${chip}</pb-tooltip>`
      : chip;
  }
}

customElements.define('pb-rule-set-chip', RuleSetChip);
