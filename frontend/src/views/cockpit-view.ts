import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { ApiError } from '../api/client';
import '../components/pb-error-state';

export const reportedEvidence = html`<p>These outcomes are shown as reported to the ledger.</p>`;

export abstract class CockpitView<T = never> extends LitElement {
  static override styles = css`
    @layer tokens, base, components, utilities;

    @layer base {
      h1 {
        margin-block: 0;
        overflow-wrap: anywhere;
        font-size: var(--type-heading);
        line-height: var(--line-heading);
      }

      a {
        color: inherit;
      }

      :focus-visible {
        outline: var(--focus-ring);
        outline-offset: var(--focus-offset);
      }
    }

    @layer components {
      :host {
        display: block;
      }

      pb-definition-list {
        margin-block-end: var(--space-6);
      }
    }
  `;

  private request?: AbortController;
  private data?: T;
  private error?: ApiError;

  protected abstract heading(data?: T): string;
  protected abstract content(data?: T): TemplateResult;
  protected read?(signal: AbortSignal): Promise<T>;

  override connectedCallback() {
    super.connectedCallback();
    void this.load();
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this.setTitle();
      this.focusHeading();
    });
  }

  override disconnectedCallback() {
    this.dispose();
    super.disconnectedCallback();
  }

  async load() {
    if (!this.read || !this.isConnected) return;
    this.dispose();
    const request = new AbortController();
    this.request = request;
    this.error = undefined;
    this.requestUpdate();
    try {
      const data = await this.read(request.signal);
      if (!request.signal.aborted) this.data = data;
    } catch (error) {
      if (request.signal.aborted) return;
      this.data = undefined;
      this.error = error instanceof ApiError ? error : new ApiError('request_failed');
    } finally {
      if (!request.signal.aborted) {
        this.request = undefined;
        this.requestUpdate();
      }
    }
  }

  dispose() {
    this.request?.abort();
    this.request = undefined;
  }

  protected override updated() {
    if (this.isConnected) this.setTitle();
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
      case 'ledger_unavailable':
        return html`<pb-error-state heading="Ledger unavailable"
          message="Cockpit could not load data from the ledger." retryable
          @retry=${this.retry}></pb-error-state>`;
      case 'unauthorized':
        return html`<p role="status">Redirecting to sign-in…</p>`;
      default:
        return html`<pb-error-state heading="Unable to load attestations"
          message="The request did not complete." retryable @retry=${this.retry}></pb-error-state>`;
    }
  }

  override render() {
    return html`
      <h1 tabindex="-1">${this.heading(this.data)}</h1>
      ${this.content(this.data)}
      ${this.error ? this.renderError(this.error) : nothing}
      ${this.request ? html`<p role="status">Loading…</p>` : nothing}
    `;
  }
}
