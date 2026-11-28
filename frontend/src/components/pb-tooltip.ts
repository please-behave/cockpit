import { css, html, LitElement, nothing, type PropertyValues } from 'lit';

const hoverDelay = 100;
const viewportGutter = 8;

/** An explanation or the complete value of a shortened or clipped label. */
export class Tooltip extends LitElement {
  static override properties = {
    description: { type: String },
    hint: { type: Boolean },
    textValue: { type: Boolean, attribute: 'text-value', reflect: true },
    visibleText: { attribute: false },
    clippingSelector: { type: String, attribute: 'clipping-selector' },
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

      :host([value-chip]) button {
        cursor: pointer;
        user-select: none;
      }

      .value {
        display: inline-block;
        max-inline-size: 100%;
        overflow: clip;
        text-overflow: ellipsis;
      }

      button:focus-visible, .value:focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }

      .value:focus-visible {
        outline-offset: calc(-1 * var(--focus-offset));
      }

      .hint:is(button, [tabindex]) {
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
  declare textValue: boolean;
  declare visibleText?: string;
  /** An adjacent part of the label, selected within the tooltip’s parent. */
  declare clippingSelector?: string;
  declare externalTrigger: boolean;
  declare interactive: boolean;

  private static observer?: ResizeObserver;
  private static observed = new WeakMap<Element, Tooltip>();
  private static pending = new Set<Tooltip>();
  private observedTargets: HTMLElement[] = [];
  private detailsAvailable = false;
  private timer?: ReturnType<typeof setTimeout>;
  private listeners?: AbortController;
  private coordinates?: CSSStyleDeclaration;
  private pointerOverTrigger = false;
  private pointerOverPreview = false;
  private tapped = false;

  constructor() {
    super();
    this.description = '';
    this.hint = false;
    this.textValue = false;
    this.externalTrigger = false;
    this.interactive = false;
  }

  override connectedCallback() {
    super.connectedCallback();
    void this.updateComplete.then(() => {
      if (this.isConnected) this.observeTrigger();
    });
  }

  override disconnectedCallback() {
    this.unobserveTrigger();
    this.pointerOverTrigger = false;
    this.pointerOverPreview = false;
    this.dismiss();
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues<this>) {
    if (this.textValue) this.observeTrigger();
    else if (changed.has('textValue')) this.unobserveTrigger();
    if (changed.has('description') && !this.popup.hidden) this.place();
  }

  override render() {
    return html`
      <span @pointerenter=${this.enter} @pointermove=${this.move} @pointerleave=${this.leave}
        @focusin=${this.focusTrigger} @focusout=${this.focusLeft} @click=${this.activate}>
        ${this.externalTrigger ? html`<slot @slotchange=${this.observeTrigger}></slot>`
          : this.textValue ? html`<span class=${this.hint ? 'value hint' : 'value'}><slot></slot></span>` : html`
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

  private get shortened() {
    return this.visibleText !== undefined && this.visibleText !== this.description;
  }

  private get clippingTargets() {
    const adjacent = this.clippingSelector ? this.parentElement?.querySelector<HTMLElement>(this.clippingSelector) : null;
    return [this.trigger, adjacent].filter((target): target is HTMLElement => Boolean(target));
  }

  private observeTrigger = () => {
    if (!this.isConnected || !this.textValue) return;
    const targets = this.shortened ? [] : this.clippingTargets;
    if (targets.length !== this.observedTargets.length ||
        targets.some((target, index) => target !== this.observedTargets[index])) {
      this.unobserveTrigger();
      if (targets.length && typeof ResizeObserver !== 'undefined') {
        Tooltip.observer ??= new ResizeObserver(entries => {
          for (const { target } of entries) Tooltip.observed.get(target)?.queueMeasurement();
        });
        this.observedTargets = targets;
        for (const target of targets) {
          Tooltip.observed.set(target, this);
          Tooltip.observer.observe(target);
        }
      }
    }
    this.queueMeasurement();
  };

  private unobserveTrigger() {
    for (const target of this.observedTargets) {
      Tooltip.observer?.unobserve(target);
      Tooltip.observed.delete(target);
    }
    this.observedTargets = [];
  }

  private queueMeasurement() {
    const pending = Tooltip.pending;
    if (!pending.size) {
      queueMicrotask(() => {
        // Read every label's layout before changing focusability in a large table.
        const measurements = Array.from(pending, tooltip => [tooltip, tooltip.hasHiddenText()] as const);
        pending.clear();
        for (const [tooltip, available] of measurements) {
          const revealed = available && !tooltip.detailsAvailable;
          tooltip.updateAvailability(available);
          if (revealed && tooltip.isConnected) tooltip.showWhenActive();
        }
      });
    }
    pending.add(this);
  }

  private hasHiddenText() {
    return Boolean(this.description && this.trigger && (this.shortened ||
      this.clippingTargets.some(target => target.scrollWidth > target.clientWidth)));
  }

  private measure() {
    if (!this.textValue) return true;
    const available = this.hasHiddenText();
    this.updateAvailability(available);
    return available;
  }

  private updateAvailability(available: boolean) {
    if (!this.isConnected || !this.textValue) return;
    const changed = available !== this.detailsAvailable;
    this.detailsAvailable = available;

    const trigger = this.trigger;
    if (trigger && !this.externalTrigger) {
      if (available && trigger.tabIndex !== 0) trigger.tabIndex = 0;
      if (!available && trigger.hasAttribute('tabindex')) trigger.removeAttribute('tabindex');
      const descriptionId = available && this.shortened ? 'description' : null;
      if (trigger.getAttribute('aria-describedby') !== descriptionId) {
        if (descriptionId) trigger.setAttribute('aria-describedby', descriptionId);
        else trigger.removeAttribute('aria-describedby');
      }
    }
    if (changed && !available) this.dismiss();
  }

  private showWhenActive() {
    if (this.trigger.matches(':focus-visible')) this.open();
    else if (this.pointerOverTrigger) this.scheduleHover();
  }

  private enter(event: PointerEvent) {
    if (event.pointerType === 'touch') return;
    if (this.externalTrigger) this.move(event);
    else {
      this.pointerOverTrigger = true;
      this.scheduleHover();
    }
  }

  private scheduleHover() {
    if (!this.measure() || !this.popup.hidden || this.timer !== undefined) return;
    this.listenForDismissal();
    this.timer = setTimeout(() => this.open(), hoverDelay);
  }

  private move(event: PointerEvent) {
    if (!this.externalTrigger || event.pointerType === 'touch') return;
    if (event.composedPath().includes(this.popup)) {
      this.pointerOverPreview = true;
      return;
    }
    const wasOverPreview = this.pointerOverPreview;
    this.pointerOverPreview = false;
    // A stretched link can receive pointer events outside the visible label.
    const over = this.overTrigger(event);
    if (over === this.pointerOverTrigger && !wasOverPreview) return;
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
    this.pointerOverPreview = false;
    if (!this.trigger.matches(':focus-visible') && !(this.interactive && this.focusInPreview)) this.dismiss();
  }

  private focusTrigger(event: FocusEvent) {
    if (!event.composedPath().includes(this.trigger) || !this.measure()) return;
    if (!this.trigger.matches(':focus-visible')) return;
    if (this.externalTrigger) this.trigger.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.open();
  }

  private focusLeft(event: FocusEvent) {
    const next = event.relatedTarget;
    if (this.pointerOverTrigger || this.pointerOverPreview ||
        (next instanceof Node && (this.contains(next) || this.renderRoot.contains(next)))) return;
    this.dismiss();
  }

  private get focusInPreview() {
    const focused = (this.getRootNode() as Document | ShadowRoot).activeElement;
    return focused !== null && this.contains(focused) && focused !== this.trigger;
  }

  private activate(event: PointerEvent) {
    if (!event.composedPath().includes(this.trigger) || !this.measure()) return;
    if (this.externalTrigger) {
      if (this.interactive && this.trigger instanceof HTMLButtonElement) {
        this.open();
        return;
      }
      if (event.pointerType !== 'touch' || !this.overTrigger(event)) return;
      if (this.trigger instanceof HTMLAnchorElement && (this.interactive ? !this.tapped : this.popup.hidden)) {
        // Let the first tap reveal the complete value and a second follow the link.
        event.preventDefault();
        this.tapped = true;
        this.open();
      } else if (this.trigger instanceof HTMLButtonElement || this.trigger.matches('span[tabindex="0"]')) {
        this.open();
      }
      return;
    }
    if (event.pointerType === 'touch' || event.detail === 0) {
      if (this.popup.hidden) this.open();
      else this.dismiss();
    } else if (this.hasAttribute('value-chip')) {
      this.open();
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
    if (!this.measure() || !popup.hidden) return;
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
      : this.shadowRoot!.querySelector<HTMLElement>(this.textValue ? '.value' : 'button')!;
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
