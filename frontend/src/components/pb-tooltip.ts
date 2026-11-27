import { css, html, LitElement, nothing, type PropertyValues } from 'lit';

const hoverDelay = 100;
const viewportGutter = 8;

/** A short description for a label or an existing, already named control. */
export class Tooltip extends LitElement {
  static override properties = {
    description: { type: String },
    hint: { type: Boolean },
    externalTrigger: { type: Boolean, attribute: 'external-trigger', reflect: true },
    interactive: { type: Boolean },
  };

  static override styles = css`
    @layer components {
      :host {
        display: inline-block;
        max-inline-size: 100%;
      }

      :host([external-trigger]) {
        display: inline;
      }

      button {
        display: inline-block;
        min-inline-size: var(--target-min-size);
        min-block-size: var(--target-min-size);
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
        font: var(--type-data) / var(--line-data) var(--font-family);
        white-space: normal;
        overflow-wrap: anywhere;
      }

      [popover][hidden] {
        display: none;
      }

      [popover][data-above] {
        padding: 0 0 var(--space-2);
      }

      [role="group"] .surface {
        box-sizing: border-box;
        max-block-size: calc(100dvh - 16px - var(--space-2));
        overflow: auto;
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
  declare externalTrigger: boolean;
  declare interactive: boolean;

  private timer?: ReturnType<typeof setTimeout>;
  private listeners?: AbortController;
  private coordinates?: CSSStyleDeclaration;
  private pointerOverTrigger = false;
  private tapped = false;

  constructor() {
    super();
    this.description = '';
    this.hint = false;
    this.externalTrigger = false;
    this.interactive = false;
  }

  override disconnectedCallback() {
    this.pointerOverTrigger = false;
    this.dismiss();
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('description') && !this.popup.hidden) this.place();
  }

  override render() {
    return html`
      <span @pointerenter=${this.enter} @pointermove=${this.move} @pointerleave=${this.leave}
        @focusin=${this.focusTrigger} @focusout=${this.focusLeft} @click=${this.activate}>
        ${this.externalTrigger ? html`<slot></slot>` : html`
          <button type="button" class=${this.hint ? 'hint' : ''} aria-describedby="description"><slot></slot></button>
        `}
        <span id="description" role=${this.interactive ? 'group' : 'tooltip'} popover="manual" hidden
          aria-label=${this.interactive ? this.description : nothing}
          aria-hidden=${this.externalTrigger && !this.interactive ? 'true' : nothing}>
          <span class="surface">${this.interactive ? html`<slot name="preview"></slot>` : this.description}</span>
        </span>
      </span>
    `;
  }

  private enter(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    if (this.externalTrigger) this.move(event);
    else this.scheduleHover();
  }

  private scheduleHover() {
    if (!this.popup.hidden || this.timer !== undefined) return;
    this.listenForDismissal();
    this.timer = setTimeout(() => this.open(), hoverDelay);
  }

  private move(event: PointerEvent) {
    if (!this.externalTrigger || event.pointerType === 'touch' || event.composedPath().includes(this.popup)) return;
    // A stretched link can receive pointer events outside the visible label.
    const over = this.overTrigger(event);
    if (over === this.pointerOverTrigger) return;
    if (over) {
      this.pointerOverTrigger = true;
      this.scheduleHover();
    } else {
      this.leave(event);
    }
  }

  private overTrigger(event: PointerEvent) {
    const { left, right, top, bottom } = this.trigger.getBoundingClientRect();
    return event.clientX >= left && event.clientX <= right && event.clientY >= top && event.clientY <= bottom;
  }

  private leave(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    this.pointerOverTrigger = false;
    if (!this.trigger.matches(':focus-visible') && !(this.interactive && this.focusInPreview)) this.dismiss();
  }

  private focusTrigger(event: FocusEvent) {
    if (!event.composedPath().includes(this.trigger)) return;
    if (!this.trigger.matches(':focus-visible')) return;
    if (this.externalTrigger) this.trigger.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.open();
  }

  private focusLeft(event: FocusEvent) {
    const next = event.relatedTarget;
    if (this.interactive && next instanceof Node &&
        (this.contains(next) || this.renderRoot.contains(next))) return;
    this.dismiss();
  }

  private get focusInPreview() {
    const focused = (this.getRootNode() as Document | ShadowRoot).activeElement;
    return focused !== null && this.contains(focused) && focused !== this.trigger;
  }

  private activate(event: PointerEvent) {
    if (!event.composedPath().includes(this.trigger)) return;
    if (this.externalTrigger) {
      if (event.pointerType !== 'touch' || !this.overTrigger(event)) return;
      if (this.trigger instanceof HTMLAnchorElement && (this.interactive ? !this.tapped : this.popup.hidden)) {
        // Let the first tap reveal the complete value and a second follow the link.
        event.preventDefault();
        this.tapped = true;
        this.open();
      } else if (this.trigger instanceof HTMLButtonElement) {
        this.open();
      }
      return;
    }
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
      if (event.key !== 'Escape') return;
      if (this.interactive && this.focusInPreview) this.trigger.focus({ preventScroll: true });
      this.dismiss();
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
    for (let root = this.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) {
      root.addEventListener('scroll', this.place, { signal, capture: true });
    }
    const viewport = this.ownerDocument.defaultView!;
    viewport.addEventListener('scroll', this.place, { signal, capture: true });
    viewport.addEventListener('resize', this.place, { signal });
  }

  private dismiss() {
    this.tapped = false;
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
    return this.externalTrigger
      ? this.shadowRoot!.querySelector('slot')!.assignedElements()[0] as HTMLElement
      : this.shadowRoot!.querySelector('button')!;
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
