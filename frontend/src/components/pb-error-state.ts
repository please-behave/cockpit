import { css, html, LitElement, nothing } from 'lit';
import { statePanelStyles } from './state-panel';

export class ErrorState extends LitElement {
  static override properties = {
    heading: { type: String },
    message: { type: String },
    retryable: { type: Boolean },
  };

  static override styles = [
    statePanelStyles,
    css`
      @layer components {
        button {
          margin-block-start: var(--space-3);
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--border);
          border-radius: var(--radius-control);
          background: var(--surface);
          color: var(--text);
          font: inherit;
        }

        button:focus-visible {
          outline: var(--focus-ring);
          outline-offset: var(--focus-offset);
        }
      }
    `,
  ];

  declare heading: string;
  /** User-facing copy for the failure. */
  declare message: string;
  declare retryable: boolean;

  constructor() {
    super();
    this.heading = 'Unable to load results';
    this.message = 'The results could not be loaded.';
    this.retryable = false;
  }

  private retry() {
    this.dispatchEvent(new Event('retry', { bubbles: true, composed: true }));
  }

  override render() {
    return html`
      <div class="panel">
        <h2>${this.heading}</h2>
        <p>${this.message}</p>
        ${this.retryable ? html`<button type="button" @click=${this.retry}>Retry</button>` : nothing}
      </div>
    `;
  }
}

customElements.define('pb-error-state', ErrorState);
