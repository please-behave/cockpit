import { css, html, nothing, type CSSResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { releases, type ReleaseSummary } from '../api/client';
import '../components/pb-empty-state';
import type { KeyValueItem } from '../components/pb-key-value';
import '../components/pb-key-value';
import '../components/pb-relative-time';
import '../components/pb-rule-set-chip';
import '../components/pb-section';
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

    .releases {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: var(--space-2);
    }

    .release {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 5fr);
      align-items: start;
      gap: var(--space-2) var(--space-4);
      padding: var(--panel-padding);
      border: 1px solid var(--panel-border);
      border-radius: var(--radius-panel);
      background: var(--surface-raised);
    }

    .release > a {
      justify-self: start;
      font-weight: var(--weight-semibold);
    }

    @media (max-width: 52rem) {
      .release { grid-template-columns: minmax(0, 1fr); }
    }
  }
`;

function releaseRow(entry: ReleaseSummary, overview: boolean) {
  const sets = entry.evidence?.completed_rule_sets ?? [];
  const items: KeyValueItem[] = [
    overview ? { term: 'Newest version',
      description: html`<a data-route href=${releasePath(entry.repository, entry.version)}>${entry.version}</a>` }
      : { term: 'Commit', description: html`<pb-tooltip .description=${entry.commit}>
        <code>${entry.commit.slice(0, 7)}</code></pb-tooltip>` },
    { term: 'Recorded', description: html`<pb-relative-time .value=${entry.received_at}></pb-relative-time>` },
    { term: 'Evidence', description: html`<pb-status-pill .status=${entry.evidence?.overall ?? 'No evidence'}></pb-status-pill>` },
  ];
  if (sets.length) items.push({
    term: 'Completed Rule Sets',
    fullWidth: true,
    description: html`<ul class="chips" role="list">${sets.map(set => html`
      <li><pb-rule-set-chip .label=${set.name} .href=${ruleSetPath(set, set.version)}></pb-rule-set-chip></li>
    `)}</ul>`,
  });
  return html`
    <li class="release">
      ${overview
        ? html`<pb-section compact><h2 slot="heading">
          <a data-route href=${repositoryPath(entry.repository)}>${entry.repository}</a>
        </h2></pb-section>`
        : html`<a data-route href=${releasePath(entry.repository, entry.version)}>${entry.version}</a>`}
      <pb-key-value .items=${items}></pb-key-value>
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
