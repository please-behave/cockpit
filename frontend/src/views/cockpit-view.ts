import { css, html, LitElement, nothing, type CSSResultGroup, type TemplateResult } from 'lit';
import { ApiError } from '../api/client';
import '../components/pb-error-state';
import { controlStyles } from '../styles/controls';
import { disclosureStyles } from '../styles/disclosure';
import { linkStyles } from '../styles/links';
import { textStyles } from '../styles/text';
import {
  defaultRefreshInterval, isRefreshInterval, storedRefreshInterval, storeRefreshInterval,
} from '../refresh-interval';


export type RefreshState = {
  view: Element & { refresh(): void; setRefreshInterval(interval: number): void };
  updatedAt: Date;
  busy: boolean;
  interval: number;
  cycleStart: number;
};

export abstract class CockpitView<T = never> extends LitElement {
  static override styles: CSSResultGroup = css`
    ${linkStyles}
    ${controlStyles}
    ${disclosureStyles}
    ${textStyles}

    @layer base {
      h1 {
        margin-block: 0;
        overflow-wrap: anywhere;
        font-size: var(--type-heading);
        line-height: var(--line-heading);
      }

      h2, h3 { line-height: var(--line-heading); }
      h2 { font-size: var(--type-section); }
      h3 { font-size: var(--type-subsection); }

      p, .plain-text { max-inline-size: var(--measure-prose); }

      :focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }
    }

    @layer utilities {
      .assistive {
        position: absolute;
        inline-size: 1px;
        block-size: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }

    @layer components {
      :host {
        display: block;
      }
    }
  `;

  private request?: AbortController;
  private data?: T;
  private error?: ApiError;
  private refreshing = false;
  private stale = false;
  private updatedAt?: Date;
  private timer?: number;
  private hiddenSince?: number;
  private interval = defaultRefreshInterval;
  private cycleStart = Date.now();
  private announced?: Pick<RefreshState, 'interval' | 'cycleStart' | 'busy'> & { updatedAt?: Date };

  /** Top-level views hide the headline visually; it stays exposed and focusable. */
  protected get headingVisible(): boolean { return true; }
  /** A refreshable view reads again periodically and on demand, and reports its state to the shell. */
  protected readonly refreshable: boolean = false;
  protected abstract heading(data?: T): string;
  protected abstract content(data?: T): TemplateResult;
  protected read?(signal: AbortSignal, refresh: boolean): Promise<T>;

  override connectedCallback() {
    super.connectedCallback();
    if (this.data === undefined) void this.load();
    if (this.refreshable) {
      this.interval = storedRefreshInterval();
      this.announced = undefined;
      this.requestUpdate();
      this.startTimer();
      document.addEventListener('visibilitychange', this.visibility);
    }
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this.setTitle();
      this.focusHeading();
    });
  }

  override disconnectedCallback() {
    this.dispose();
    window.clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.visibility);
    super.disconnectedCallback();
  }

  private startTimer() {
    window.clearInterval(this.timer);
    this.cycleStart = Date.now();
    this.timer = window.setInterval(() => {
      this.cycleStart = Date.now();
      this.refreshIfVisible();
      this.requestUpdate();
    }, this.interval);
  }

  private refreshIfVisible() {
    if (document.visibilityState === 'visible') void this.load(true);
  }

  private readonly visibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenSince = Date.now();
      return;
    }
    const since = this.hiddenSince;
    this.hiddenSince = undefined;
    if (since !== undefined && Date.now() - since > this.interval) this.refreshIfVisible();
  };

  /** Applies and stores the viewer's choice, and starts counting the new interval. */
  setRefreshInterval(interval: number) {
    if (!isRefreshInterval(interval)) return;
    this.interval = interval;
    storeRefreshInterval(interval);
    this.startTimer();
    this.requestUpdate();
  }

  /** Reads immediately and restarts the interval. */
  refresh() {
    if (this.refreshing) return;
    this.startTimer();
    void this.load(true);
  }

  /** A refresh keeps the data on screen and reports a failure as a notice. */
  async load(refresh = false) {
    if (!this.read || !this.isConnected || (refresh && this.request)) return;
    this.dispose();
    const request = new AbortController();
    this.request = request;
    this.refreshing = refresh && this.data !== undefined;
    if (!this.refreshing) this.error = undefined;
    this.requestUpdate();
    try {
      const data = await this.read(request.signal, this.refreshing);
      if (!request.signal.aborted) {
        if (this.refreshing) this.keepRefreshFocus();
        this.data = data;
        this.stale = false;
        this.updatedAt = new Date();
      }
    } catch (error) {
      if (request.signal.aborted) return;
      if (this.refreshing) {
        this.stale = true;
      } else {
        this.data = undefined;
        this.error = error instanceof ApiError ? error : new ApiError('request_failed');
      }
    } finally {
      if (!request.signal.aborted) {
        this.request = undefined;
        this.refreshing = false;
        this.requestUpdate();
      }
    }
  }

  private keepRefreshFocus() {
    let focused = this.shadowRoot?.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    if (!(focused instanceof HTMLElement)) return;
    const target = focused;
    // Wait for the view and its keyed list to render before restoring a moved control.
    this.requestUpdate();
    void this.updateComplete.then(() => {
      if (target.isConnected && this.ownerDocument.activeElement === this.ownerDocument.body) {
        target.focus({ preventScroll: true });
      }
    });
  }

  dispose() {
    this.request?.abort();
    this.request = undefined;
  }

  protected override updated() {
    if (this.isConnected) this.setTitle();
    this.announceRefresh();
  }

  private announceRefresh() {
    const { data, updatedAt, refreshing, interval, cycleStart, announced } = this;
    if (!this.refreshable || !updatedAt || data === undefined) return;
    if (announced?.updatedAt === updatedAt && announced.busy === refreshing
      && announced.interval === interval && announced.cycleStart === cycleStart) return;
    this.announced = { updatedAt, busy: refreshing, interval, cycleStart };
    this.dispatchEvent(new CustomEvent<RefreshState>('refresh-state', {
      bubbles: true,
      composed: true,
      detail: { view: this, updatedAt, busy: refreshing, interval, cycleStart },
    }));
  }

  private setTitle() {
    document.title = `${this.heading(this.data)} | Please Behave`;
  }

  private focusHeading() {
    this.renderRoot.querySelector('h1')?.focus({ preventScroll: true });
  }

  private retry() {
    this.focusHeading();
    void this.load();
  }

  private renderError(error: ApiError) {
    switch (error.code) {
      case 'invalid_identifier':
        return html`<pb-error-state heading="Invalid attestation identifier"
          message="The attestation identifier is malformed."></pb-error-state>`;
      case 'attestation_not_found':
        return html`<pb-error-state heading="Attestation not found"
          message="There is no attestation with that identifier."></pb-error-state>`;
      case 'invalid_release':
        return html`<pb-error-state heading="Invalid release address"
          message="The release address is malformed."></pb-error-state>`;
      case 'release_not_found':
        return html`<pb-error-state heading="Release not found"
          message="There is no recorded release with that repository and version."></pb-error-state>`;
      case 'invalid_rule_identity':
        return html`<pb-error-state heading="Invalid rule identity"
          message="The registered rule address is malformed."></pb-error-state>`;
      case 'rule_not_found':
        return html`<pb-error-state heading="Registered rule not found"
          message="There are no registered versions for this rule."></pb-error-state>`;
      case 'invalid_rule_set_identity':
        return html`<pb-error-state heading="Invalid Rule Set identity"
          message="The registered Rule Set address is malformed."></pb-error-state>`;
      case 'rule_set_not_found':
        return html`<pb-error-state heading="Registered Rule Set not found"
          message="There are no registered versions for this Rule Set."></pb-error-state>`;
      case 'invalid_query':
        return html`<pb-error-state heading="Invalid page"
          message="The page cursor is invalid."></pb-error-state>`;
      case 'ledger_unavailable':
        return html`<pb-error-state heading="Ledger unavailable"
          message="Cockpit could not load data from the ledger." retryable
          @retry=${this.retry}></pb-error-state>`;
      case 'unauthorized':
        return html`<p role="status">Redirecting to sign-in…</p>`;
      default:
        return html`<pb-error-state heading="Unable to load data"
          message="The request did not complete." retryable @retry=${this.retry}></pb-error-state>`;
    }
  }

  override render() {
    return html`
      <h1 tabindex="-1" class=${this.headingVisible ? nothing : 'assistive'}>${this.heading(this.data)}</h1>
      ${this.content(this.data)}
      ${this.error ? this.renderError(this.error) : nothing}
      ${this.stale ? html`<p role="status">The data could not be refreshed. Showing the last data received.</p>` : nothing}
      ${this.request && !this.refreshing ? html`<p role="status">Loading…</p>` : nothing}
    `;
  }
}
