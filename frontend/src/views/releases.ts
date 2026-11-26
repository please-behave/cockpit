import { css, html, nothing, type CSSResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { releases, type ReleaseSummary } from '../api/client';
import '../components/pb-empty-state';
import '../components/pb-relative-time';
import '../components/pb-rule-set-chip';
import '../components/pb-status-pill';
import '../components/pb-tooltip';
import { CockpitView } from './cockpit-view';
import { releasePath, repositoryPath, ruleSetPath } from './router';

function needsAttention({ evidence }: ReleaseSummary) {
  return evidence === null || evidence.overall === 'FAIL' || evidence.overall === 'ERROR';
}

export const releaseListStyles = css`
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

    h2.release-title {
      margin: 0;
      font-size: inherit;
    }

    .release > a {
      justify-self: start;
      font-weight: var(--weight-semibold);
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
`;

function releaseRow(entry: ReleaseSummary, overview: boolean) {
  const sets = entry.evidence?.completed_rule_sets ?? [];
  return html`
    <li class="release">
      ${overview
        ? html`<h2 class="release-title"><a data-route href=${repositoryPath(entry.repository)}>${entry.repository}</a></h2>`
        : html`<a data-route href=${releasePath(entry.repository, entry.version)}>${entry.version}</a>`}
      <dl>
        ${overview ? html`<div><dt>Newest version</dt><dd><a data-route href=${releasePath(entry.repository, entry.version)}>${entry.version}</a></dd></div>`
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

export function releaseList(entries: ReleaseSummary[], overview: boolean) {
  if (entries.length === 0) {
    return html`<pb-empty-state heading="No releases" .message=${overview
      ? 'No release has been recorded yet.'
      : 'No release has been recorded for this repository.'}></pb-empty-state>`;
  }
  return html`<ul class="releases" role="list">
    ${repeat(entries, entry => overview ? entry.repository : entry.version, entry => releaseRow(entry, overview))}
  </ul>`;
}

export class ReleasesView extends CockpitView<ReleaseSummary[]> {
  static override styles = [CockpitView.styles as CSSResult, releaseListStyles];

  protected override get headingVisible() { return false; }

  protected override heading() {
    return 'Releases';
  }

  protected override async read(signal: AbortSignal) {
    const entries = await releases(null, signal);
    return entries.sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a))
      || a.repository.localeCompare(b.repository));
  }

  protected override content(entries?: ReleaseSummary[]) {
    return html`${entries === undefined ? nothing : releaseList(entries, true)}`;
  }
}

customElements.define('pb-releases', ReleasesView);
