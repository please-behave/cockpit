import { css, html, nothing, type CSSResult } from 'lit';
import { registeredRules, rulePageSize, type RegisteredRule } from '../api/client';
import '../components/pb-badge';
import '../components/pb-data-table';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-empty-state';
import { CockpitView } from './cockpit-view';
import { rulePath } from './router';

const columns: readonly DataTableColumn[] = [
  { label: 'Rule', part: 'rule-name' },
  { label: 'Kind', mode: 'content' },
  { label: 'Description', part: 'rule-description' },
];

export class RulesView extends CockpitView<RegisteredRule[]> {
  static override properties = { search: { attribute: false } };

  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      pb-data-table::part(rule-name) {
        min-inline-size: 12ch;
      }

      pb-data-table::part(rule-description) {
        inline-size: 100%;
        min-inline-size: 24ch;
      }
    }
  `];

  declare search: string;

  private get cursor() {
    return new URLSearchParams(this.search).get('before');
  }

  protected override read(signal: AbortSignal) {
    return registeredRules(this.cursor, signal);
  }

  protected override heading() {
    return 'Registered rules';
  }

  protected override readonly headingVisible = false;

  protected override content(rules?: RegisteredRule[]) {
    if (!rules) return html``;
    const rows = rules.map(rule => ({
      key: rulePath(rule),
      cells: [
        html`<a data-route href=${rulePath(rule)}>${rule.name || rule.id}</a>`,
        html`<pb-badge>${rule.kind}</pb-badge>`,
        rule.description ?? '',
      ],
    }));
    const last = rules.at(-1);
    const next = rules.length === rulePageSize && last
      ? new URLSearchParams({ before: JSON.stringify({ source: last.source, path: last.path, id: last.id }) })
      : undefined;
    return html`
      ${rules.length > 0
        ? html`<pb-data-table label="Rules" .columns=${columns} .rows=${rows}
            row-header-column="0"></pb-data-table>`
        : html`<pb-empty-state heading="No rules"
            message=${this.cursor === null ? 'No rules have been registered yet.' : 'There are no more registered rules.'}>
          </pb-empty-state>`}
      ${this.cursor !== null ? html`<p><a data-route href="/rules">First page</a></p>` : nothing}
      ${next ? html`<p><a data-route href=${`/rules?${next}`}>Next page</a></p>` : nothing}
    `;
  }
}

customElements.define('pb-rules', RulesView);
