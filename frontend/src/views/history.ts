import { css, html, nothing, type CSSResult } from 'lit';
import { attestationPage, type Summary } from '../api/client';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-commit-link';
import '../components/pb-data-table';
import '../components/pb-empty-state';
import '../components/pb-error-state';
import '../components/pb-short-name';
import '../components/pb-status-pill';
import '../components/pb-time';
import '../components/pb-tooltip';
import { CockpitView } from './cockpit-view';
import { repositoryPath } from './router';

const pageSize = 100;

const columns: DataTableColumn[] = [
  { label: 'Reported', mode: 'content' },
  { label: 'Repository', mode: 'fill' },
  { label: 'Commit', mode: 'content' },
  { label: 'Overall', mode: 'content' },
];

function withoutDuplicates(summaries: readonly Summary[], known = new Set<string>()): Summary[] {
  return summaries.filter(summary => {
    if (known.has(summary.id)) return false;
    known.add(summary.id);
    return true;
  });
}

export class HistoryView extends CockpitView<Summary[]> {
  static override properties = {
    loaded: { state: true },
    ended: { state: true },
    loadingMore: { state: true },
    moreFailed: { state: true },
  };

  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      /* Prepending refreshed rows keeps the page at the same scroll offset. */
      :host { overflow-anchor: none; }

      .sentinel {
        block-size: 1px;
      }

      pb-error-state {
        margin-block-start: var(--space-4);
      }
    }
  `];

  declare loaded: Summary[];
  declare ended: boolean;
  declare loadingMore: boolean;
  declare moreFailed: boolean;
  private observer?: IntersectionObserver;
  private more?: AbortController;
  private watching?: Element;

  constructor() {
    super();
    this.loaded = [];
    this.ended = false;
    this.loadingMore = false;
    this.moreFailed = false;
  }

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener('resize', this.resize);
    this.watchSentinel();
  }

  private readonly resize = () => {
    this.observer?.disconnect();
    this.observer = undefined;
    this.watchSentinel();
  };

  override disconnectedCallback() {
    window.removeEventListener('resize', this.resize);
    this.more?.abort();
    this.more = undefined;
    this.loadingMore = false;
    this.observer?.disconnect();
    this.observer = undefined;
    this.watching = undefined;
    super.disconnectedCallback();
  }

  protected override async read(signal: AbortSignal, refresh: boolean) {
    const page = await attestationPage({ limit: pageSize }, signal);
    const known = new Set(this.loaded.map(summary => summary.id));
    if (refresh && page.some(summary => known.has(summary.id))) {
      // Pages already loaded below stay; only entries not yet loaded move to the top.
      this.loaded = [...withoutDuplicates(page, known), ...this.loaded];
      return page;
    }
    this.more?.abort();
    this.more = undefined;
    this.loadingMore = false;
    this.moreFailed = false;
    this.loaded = withoutDuplicates(page);
    this.ended = page.length < pageSize;
    return page;
  }

  protected override heading() {
    return 'Attestations';
  }

  protected override get headingVisible() { return false; }
  protected override readonly refreshable = true;

  protected override content(page?: Summary[]) {
    return html`
      ${page === undefined ? nothing : this.history()}
    `;
  }

  protected override updated() {
    super.updated();
    this.watchSentinel();
  }

  private watchSentinel() {
    if (!this.isConnected) return;
    const sentinel = this.renderRoot.querySelector('.sentinel');
    if (!sentinel) {
      this.observer?.disconnect();
      this.observer = undefined;
      this.watching = undefined;
      return;
    }
    this.observer ??= new IntersectionObserver(
      (entries, observer) => {
        if (this.observer === observer && entries.some(entry => entry.isIntersecting)) void this.loadMore();
      },
      { root: null, rootMargin: `0px 0px ${window.innerHeight}px` },
    );

    // Observe again after a page in case the sentinel is still in range.
    if (this.watching) this.observer.unobserve(this.watching);
    this.watching = sentinel;
    this.observer.observe(sentinel);
  }

  private async loadMore() {
    const last = this.loaded.at(-1);
    if (!last || this.ended || this.loadingMore || this.moreFailed) return;

    const request = new AbortController();
    this.more = request;
    this.loadingMore = true;
    try {
      const page = await attestationPage({ before: last.id, limit: pageSize }, request.signal);
      const fresh = withoutDuplicates(page, new Set(this.loaded.map(summary => summary.id)));
      this.loaded = [...this.loaded, ...fresh];
      // A full page without a new row would ask for the same page again.
      this.ended = page.length < pageSize || fresh.length === 0;
    } catch {
      if (request.signal.aborted) return;
      this.moreFailed = true;
    }
    this.loadingMore = false;
  }

  private retryMore() {
    this.moreFailed = false;
    void this.loadMore();
  }

  private history() {
    if (this.loaded.length === 0) {
      return html`<pb-empty-state heading="No attestations"
        message="No attestations have been reported yet."></pb-empty-state>`;
    }

    const rows = this.loaded.map(summary => ({
      key: summary.id,
      cells: [
        html`<a data-route href=${`/attestations/${encodeURIComponent(summary.id)}`}>
          <pb-time .value=${summary.received_at}></pb-time></a>`,
        html`<pb-tooltip external-trigger .description=${summary.repository}>
          <a data-route href=${repositoryPath(summary.repository)}>
            <pb-short-name .value=${summary.repository}></pb-short-name></a>
        </pb-tooltip>`,
        html`<pb-commit-link .repository=${summary.repository} .commit=${summary.commit}></pb-commit-link>`,
        html`<pb-status-pill .status=${summary.overall}></pb-status-pill>`,
      ],
    }));
    const count = `${this.loaded.length} ${this.loaded.length === 1 ? 'attestation' : 'attestations'}`;

    return html`
      <pb-data-table label="Attestations" .columns=${columns} .rows=${rows}></pb-data-table>
      <div class="sentinel"></div>
      ${this.loadingMore ? html`<p role="status">Loading older attestations…</p>` : nothing}
      ${this.moreFailed
        ? html`<pb-error-state heading="Older attestations unavailable"
          message="Cockpit could not load older attestations." retryable
          @retry=${this.retryMore}></pb-error-state>`
        : nothing}
      <p class="assistive" role="status">${this.loadingMore || this.moreFailed ? nothing
        : this.ended ? `All ${count} loaded.` : `${count} loaded.`}</p>
    `;
  }
}

customElements.define('pb-history', HistoryView);
