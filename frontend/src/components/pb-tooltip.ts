import { css, html, LitElement } from 'lit';

const hoverDelay = 100;
const viewportGutter = 8;

/** A short description for a non-interactive label supplied through the default slot. */
export class Tooltip extends LitElement {
  static override properties = {
    description: { type: String },
    hint: { type: Boolean },
  };

  static override styles = css`
    @layer components {
      :host {
        display: inline-block;
        max-inline-size: 100%;
      }

      button {
        display: inline-block;
        max-inline-size: 100%;
        padding: 0;
        border: 0;
        border-radius: var(--radius-control);
        background: var(--surface-transparent);
        color: inherit;
        font: inherit;
        text-align: inherit;
      }

      button:focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }

      button.hint {
        border-block-end: 1px dotted var(--text-muted);
        cursor: help;
      }

      [popover] {
        position: fixed;
        inset: auto;
        top: var(--tooltip-top, 0);
        left: var(--tooltip-left, 0);
        box-sizing: border-box;
        inline-size: max-content;
        max-inline-size: min(24rem, calc(100% - 16px));
        margin: 0;
        padding: var(--space-2) 0 0;
        border: 0;
        overflow: visible;
        background: var(--surface-transparent);
        color: var(--text);
        font: var(--type-body) / var(--line-body) var(--font-family);
        white-space: normal;
        overflow-wrap: anywhere;
      }

      [popover][hidden] {
        display: none;
      }

      [popover][data-above] {
        padding: 0 0 var(--space-2);
      }

      .surface {
        display: block;
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface-raised);
        box-shadow: var(--elevation-panel);
      }

      /* The padding on the popover bridges the pointer's path to the surface. */
      .surface::before {
        position: absolute;
        top: var(--space-2);
        left: var(--tooltip-arrow, 50%);
        inline-size: var(--space-2);
        block-size: var(--space-2);
        transform: translate(-50%, -50%) rotate(45deg);
        border-block-start: 1px solid var(--border);
        border-inline-start: 1px solid var(--border);
        background: var(--surface-raised);
        content: '';
      }

      [data-above] .surface::before {
        top: calc(100% - var(--space-2));
        transform: translate(-50%, -50%) rotate(225deg);
      }
    }
  `;

  declare description: string;
  declare hint: boolean;

  private timer?: ReturnType<typeof setTimeout>;
  private listeners?: AbortController;
  private coordinates?: CSSStyleDeclaration;

  constructor() {
    super();
    this.description = '';
    this.hint = false;
  }

  override disconnectedCallback() {
    this.dismiss();
    super.disconnectedCallback();
  }

  override render() {
    return html`
      <span @pointerenter=${this.enter} @pointerleave=${this.leave}>
        <button type="button" class=${this.hint ? 'hint' : ''} aria-describedby="description"
          @focus=${this.focusTrigger} @blur=${this.dismiss} @click=${this.activate}><slot></slot></button>
        <span id="description" role="tooltip" popover="manual" hidden>
          <span class="surface">${this.description}</span>
        </span>
      </span>
    `;
  }

  private enter(event: PointerEvent) {
    if (event.pointerType === 'touch' || !this.popup.hidden || this.timer !== undefined) return;
    this.listenForDismissal();
    this.timer = setTimeout(() => this.open(), hoverDelay);
  }

  private leave(event: PointerEvent) {
    if (event.pointerType !== 'touch' && !this.trigger.matches(':focus-visible')) {
      this.dismiss();
    }
  }

  private focusTrigger() {
    if (this.trigger.matches(':focus-visible')) this.open();
  }

  private activate(event: PointerEvent) {
    if (event.pointerType === 'touch' || event.detail === 0) {
      if (this.popup.hidden) this.open();
      else this.dismiss();
    }
  }

  private listenForDismissal() {
    if (this.listeners) return this.listeners.signal;
    this.listeners = new AbortController();
    const { signal } = this.listeners;
    this.ownerDocument.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.dismiss();
    }, { signal });
    this.ownerDocument.addEventListener('pointerdown', event => {
      if (!event.composedPath().includes(this)) this.dismiss();
    }, { signal, capture: true });
    return signal;
  }

  private open() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const popup = this.popup;
    if (!popup.hidden) return;
    const signal = this.listenForDismissal();
    popup.hidden = false;
    popup.showPopover?.();
    this.place();
    this.getRootNode().addEventListener('scroll', this.place, { signal, capture: true });
    const viewport = this.ownerDocument.defaultView!;
    viewport.addEventListener('scroll', this.place, { signal, capture: true });
    viewport.addEventListener('resize', this.place, { signal });
  }

  private dismiss() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.listeners?.abort();
    this.listeners = undefined;
    const popup = this.shadowRoot?.querySelector<HTMLElement>('#description');
    if (popup && !popup.hidden) {
      popup.hidePopover?.();
      popup.hidden = true;
    }
  }

  private get popup() {
    return this.shadowRoot!.querySelector<HTMLElement>('#description')!;
  }

  private get trigger() {
    return this.shadowRoot!.querySelector('button')!;
  }

  private place = () => {
    const root = this.shadowRoot!;
    if (!root.adoptedStyleSheets) return;
    if (!this.coordinates) {
      // A private adopted rule keeps measured coordinates out of inline styles.
      const sheet = new CSSStyleSheet();
      sheet.insertRule('#description {}');
      this.coordinates = (sheet.cssRules[0] as CSSStyleRule).style;
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    }

    const anchor = this.trigger.getBoundingClientRect();
    const popup = this.popup;
    const { width, height } = popup.getBoundingClientRect();
    const { clientWidth, clientHeight } = this.ownerDocument.documentElement;
    const bottomLimit = clientHeight - viewportGutter;
    const above = anchor.bottom + height > bottomLimit && anchor.top > clientHeight - anchor.bottom;
    const center = anchor.left + anchor.width / 2;
    const left = Math.max(viewportGutter, Math.min(center - width / 2, clientWidth - width - viewportGutter));
    const top = Math.max(viewportGutter, Math.min(above ? anchor.top - height : anchor.bottom, bottomLimit - height));
    const arrow = Math.max(12, Math.min(center - left, width - 12));

    popup.toggleAttribute('data-above', above);
    this.coordinates.setProperty('--tooltip-left', `${left}px`);
    this.coordinates.setProperty('--tooltip-top', `${top}px`);
    this.coordinates.setProperty('--tooltip-arrow', `${arrow}px`);
  };
}

customElements.define('pb-tooltip', Tooltip);
