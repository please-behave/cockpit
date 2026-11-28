import { css, html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { linkStyles } from '../styles/links';
import { activityKindLabels, type ActivityEntry, type ActivityKind } from '../activity';
import './pb-icon';
import './pb-relative-time';
import { repositoryReference, repositoryReferenceStyles } from './repository-reference';
import './pb-status-pill';
import './pb-widget';

function kindList(kinds: readonly ActivityKind[]) {
  const names = kinds.map(kind => `${activityKindLabels[kind].label.toLowerCase()}s`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

export class ActivityFeed extends LitElement {
  static override properties = { entries: { attribute: false }, failed: { attribute: false } };

  static override styles = [linkStyles, repositoryReferenceStyles, css`
    @layer components {
      ul {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-2);
        margin: 0;
        padding: 0;
        list-style: none;
      }

      li + li {
        border-block-start: 1px solid var(--border-subtle);
        padding-block-start: var(--space-2);
      }

      .title {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
      }

      .kind {
        display: inline-flex;
        flex: none;
        align-items: baseline;
        gap: var(--space-1);
        font-weight: var(--weight-semibold);
      }

      p { margin: 0; }

      .fact {
        color: var(--text-muted);
        font-size: var(--type-meta);
        line-height: var(--line-meta);
      }
    }
  `];

  declare entries: readonly ActivityEntry[];
  declare failed: readonly ActivityKind[];

  constructor() {
    super();
    this.entries = [];
    this.failed = [];
  }

  override render() {
    const { entries, failed } = this;
    return html`
      <pb-widget heading="Recent activity">
        ${entries.length ? html`
          <ul role="list">
            ${repeat(entries, ({ kind, key }) => `${kind}:${key}`, ({ kind, repository, receivedAt, fact }) => {
              const { icon, label } = activityKindLabels[kind];
              return html`
                <li>
                  <div class="title">
                    <span class="kind"><pb-icon name=${icon}></pb-icon> ${label}</span> ·
                    ${repositoryReference(repository)}
                  </div>
                  <p class="fact">${kind === 'attestation' ? html`<pb-status-pill .status=${fact}></pb-status-pill>` : fact}
                    · Reported <pb-relative-time .value=${receivedAt}></pb-relative-time></p>
                </li>
              `;
            })}
          </ul>
        ` : failed.length ? nothing : html`<p>No attestations, releases or deployments have been received.</p>`}
        ${failed.length ? html`
          <p role="status">Could not read the latest ${kindList(failed)}. The feed may be incomplete or outdated.</p>
        ` : nothing}
      </pb-widget>
    `;
  }
}

customElements.define('pb-activity-feed', ActivityFeed);
