import { css, html, nothing, type CSSResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { releases, type ReleaseSummary } from '../api/client';
import '../components/pb-empty-state';
import '../components/pb-relative-time';
import '../components/pb-rule-set-chip';
import '../components/pb-status-pill';
import '../components/pb-tooltip';
import { CockpitView } from './cockpit-view';
import { repositoryReleasesPath, ruleSetPath } from './router';

function needsAttention({ evidence }: ReleaseSummary) {
  return evidence === null || evidence.overall === 'FAIL' || evidence.overall === 'ERROR';
}

export class ReleasesView extends CockpitView<ReleaseSummary[]> {
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      :host { overflow-wrap: anywhere; }

      .releases, .sets {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .releases {
        display: grid;
        gap: var(--space-2);
      }

      .release {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 5fr);
        align-items: start;
        gap: var(--space-2) var(--space-4);
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--border);
        border-radius: var(--radius-panel);
        background: var(--surface-raised);
      }

      h2 {
        margin: 0;
        font-size: inherit;
      }

      dl {
        display: grid;
        grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)) minmax(0, 2fr);
        gap: var(--space-2) var(--space-4);
        margin: 0;
      }
      dt { color: var(--text-muted); }
      dd { margin: 0; }

      .sets {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
      }

      .sets li { max-inline-size: 100%; }

      @media (max-width: 52rem) {
        .release { grid-template-columns: minmax(0, 1fr); }

        dl {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .evidence, .rule-sets { grid-column: 1 / -1; }
      }
    }
  `];

  declare repository?: string;

  protected override get headingVisible() {
    return this.repository !== undefined;
  }

  protected override heading() {
    return this.repository ?? 'Releases';
  }

  protected override async read(signal: AbortSignal) {
    const entries = await releases(this.repository ?? null, signal);
    if (this.repository === undefined) {
      entries.sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a))
        || a.repository.localeCompare(b.repository));
    }
    return entries;
  }

  private row(entry: ReleaseSummary) {
    const overview = this.repository === undefined;
    const sets = entry.evidence?.completed_rule_sets ?? [];
    return html`
      <li class="release">
        <h2>${overview
          ? html`<a data-route href=${repositoryReleasesPath(entry.repository)}>${entry.repository}</a>`
          : entry.version}</h2>
        <dl>
          ${overview ? html`<div><dt>Newest version</dt><dd>${entry.version}</dd></div>`
            : html`<div><dt>Commit</dt><dd><pb-tooltip .description=${entry.commit}>
              <code>${entry.commit.slice(0, 7)}</code></pb-tooltip></dd></div>`}
          <div><dt>Recorded</dt><dd><pb-relative-time .value=${entry.received_at}></pb-relative-time></dd></div>
          <div class="evidence"><dt>Evidence</dt><dd><pb-status-pill .status=${entry.evidence?.overall ?? 'No evidence'}></pb-status-pill></dd></div>
          ${sets.length === 0 ? nothing : html`
            <div class="rule-sets">
              <dt>Completed Rule Sets</dt>
              <dd><ul class="sets" role="list">${sets.map(set => html`
                <li><pb-rule-set-chip .label=${set.name} .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip></li>
              `)}</ul></dd>
            </div>`}
        </dl>
      </li>
    `;
  }

  protected override content(entries?: ReleaseSummary[]) {
    return html`
      ${this.repository === undefined ? nothing : html`<p><a data-route href="/releases">All releases</a></p>`}
      ${entries === undefined ? nothing : entries.length === 0
        ? html`<pb-empty-state heading="No releases" .message=${this.repository === undefined
          ? 'No release has been recorded yet.'
          : 'No release has been recorded for this repository.'}></pb-empty-state>`
        : html`<ul class="releases" role="list">
          ${repeat(entries, entry => this.repository === undefined ? entry.repository : entry.version, entry => this.row(entry))}
        </ul>`}
    `;
  }
}

customElements.define('pb-releases', ReleasesView);
