import { css, html, LitElement, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { activityKindLabels, type ActivityEntry, type ActivityKind } from '../activity';
import { linkStyles } from '../styles/links';
import { repositoryPath } from '../views/router';
import { shortName } from './pb-short-name';
import './pb-icon';
import './pb-relative-time';
import './pb-tooltip';
import './pb-widget';

function kindList(kinds: readonly ActivityKind[]) {
  const names = kinds.map(kind => `${activityKindLabels[kind].label.toLowerCase()}s`);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

export class ActivityFeed extends LitElement {
  static override properties = { entries: { attribute: false }, failed: { attribute: false } };

  static override styles = [linkStyles, css`
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

      .title pb-tooltip { min-inline-size: 0; }

      .kind {
        display: inline-flex;
        flex: none;
        align-items: baseline;
        gap: var(--space-1);
        font-weight: var(--weight-semibold);
      }

      .repository {
        vertical-align: middle;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
                    <span class="kind"><pb-icon name=${icon}></pb-icon> ${label}</span>
                    <pb-tooltip external-trigger .description=${repository}>
                      <a class="repository" data-route href=${repositoryPath(repository)}
                        aria-label=${repository}>${shortName(repository)}</a>
                    </pb-tooltip>
                  </div>
                  <p class="fact">${fact} · <pb-relative-time .value=${receivedAt}></pb-relative-time></p>
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
