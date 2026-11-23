import { css, html, LitElement } from 'lit';

export type BadgeTone = 'check' | 'review' | 'blocking' | 'neutral';

/** The tone of a rule kind; other kinds keep the plain look. */
export function kindTone(kind: string): BadgeTone | undefined {
  return kind === 'check' || kind === 'review' ? kind : undefined;
}

/** Color only reinforces the label, which always names what the badge says. */
export class Badge extends LitElement {
  static override properties = { tone: { reflect: true } };

  static override styles = css`
    @layer components {
      :host {
        display: inline-block;
        box-sizing: border-box;
        max-inline-size: 100%;
        padding: var(--space-1) var(--space-2);
        border: 1px solid var(--badge-border);
        border-radius: var(--radius-control);
        background: var(--badge-surface);
        color: var(--text);
        font-size: 0.875rem;
        font-weight: var(--weight-semibold);
        line-height: var(--line-heading);
        overflow-wrap: anywhere;
      }

      :host([tone]) {
        border-color: var(--chip-border);
        background: var(--chip-surface);
        color: var(--chip-text);
      }

      :host([tone='check']) { --chip-surface: var(--chip-check-surface); --chip-text: var(--chip-check-text); --chip-border: var(--chip-check-border); }
      :host([tone='review']) { --chip-surface: var(--chip-review-surface); --chip-text: var(--chip-review-text); --chip-border: var(--chip-review-border); }
      :host([tone='blocking']) { --chip-surface: var(--chip-blocking-surface); --chip-text: var(--chip-blocking-text); --chip-border: var(--chip-blocking-border); }
      :host([tone='neutral']) { --chip-surface: var(--chip-neutral-surface); --chip-text: var(--chip-neutral-text); --chip-border: var(--chip-neutral-border); }
    }
  `;

  declare tone?: BadgeTone;

  override render() {
    return html`<slot></slot>`;
  }
}

customElements.define('pb-badge', Badge);
