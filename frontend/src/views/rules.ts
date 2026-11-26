import { css, html, nothing, type CSSResult } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';
import {
  ApiError, registeredRules, registeredRuleSets, rulePageSize, ruleSetCompliance,
  type RegisteredRule, type RegisteredRuleSet, type RegistryCursor,
} from '../api/client';
import '../components/pb-data-table';
import type { DataTableColumn } from '../components/pb-data-table';
import '../components/pb-empty-state';
import { CockpitView } from './cockpit-view';
import { rulePath, ruleSetPath } from './router';

const columns: readonly DataTableColumn[] = [
  { label: 'Rule', part: 'rule-name' },
  { label: 'Owner', part: 'rule-owner' },
  { label: 'Description', part: 'rule-description' },
];

const visibleBatch = 20;
const complianceConcurrency = 6;

type RuleGroup = { key: string; label: string; rules: RegisteredRule[] };
type SetGroup = RuleGroup & {
  set: RegisteredRuleSet;
  repositories: string[];
  incomplete: boolean;
};
type Registry = { sets: SetGroup[]; local: RuleGroup[] };

function cursorFor({ source, path, id, version, scan }: RegistryCursor) {
  return JSON.stringify({ source, path, id, version, scan });
}

function setKey({ source, path, id, version }: { source: string; path: string; id: string; version: string }) {
  return JSON.stringify([source, path, id, version]);
}

async function readPages<T extends RegistryCursor>(
  page: (before: string | null, signal: AbortSignal) => Promise<T[]>,
  signal: AbortSignal,
) {
  const entries: T[] = [];
  const cursors = new Set<string>();
  let before = null;
  for (;;) {
    const items: T[] = await page(before, signal);
    entries.push(...items);
    if (items.length < rulePageSize) return entries;
    before = cursorFor(items[items.length - 1]);
    if (cursors.has(before)) throw new ApiError('ledger_unavailable');
    cursors.add(before);
  }
}

export class RulesView extends CockpitView<Registry> {
  static override styles = [CockpitView.styles as CSSResult, css`
    @layer components {
      .filters {
        display: grid;
        grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
        gap: var(--space-3);
        padding: var(--panel-padding);
        border: 1px solid var(--panel-border);
        border-radius: var(--radius-panel);
        background: var(--surface-raised);
      }

      label {
        display: grid;
        align-content: start;
        gap: var(--space-1);
        font-weight: var(--weight-semibold);
      }

      input, select, button {
        box-sizing: border-box;
        min-inline-size: 0;
        max-inline-size: 100%;
        min-block-size: var(--target-min-size);
        padding: var(--control-padding-block) var(--control-padding-inline);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }

      button { cursor: pointer; }
      button:hover { background: var(--surface-hover); }

      section { margin-block: var(--space-6); }
      h2 { margin-block: 0 var(--space-3); }

      details {
        margin-block: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface);
      }

      summary {
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-control);
        background: var(--surface-raised);
        color: var(--text);
        cursor: pointer;
        overflow-wrap: anywhere;
      }

      summary:focus-visible {
        outline-offset: calc(-1 * var(--focus-offset));
      }

      .set {
        border-color: var(--rule-set);
      }

      .set summary {
        background: var(--rule-set-surface);
        color: var(--rule-set-text);
      }

      .facts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1) var(--space-4);
        margin-block-start: var(--space-1);
      }

      .incomplete {
        font-weight: var(--weight-semibold);
      }

      .group-content {
        padding: var(--space-2) var(--space-4) var(--space-4);
        overflow-wrap: anywhere;
      }

      .more { margin-block: var(--space-3) 0; }

      pb-data-table::part(rule-name) { min-inline-size: 12ch; }

      pb-data-table::part(rule-owner) {
        min-inline-size: 12ch;
        max-inline-size: 28ch;
      }

      pb-data-table::part(rule-description) {
        inline-size: 100%;
        min-inline-size: 24ch;
      }

      @media (max-width: 40rem) {
        .filters { grid-template-columns: minmax(0, 1fr); }
      }
    }
  `];

  protected override get headingVisible() { return false; }
  private query = '';
  private kind = '';
  private scope = '';
  private setLimit = visibleBatch;
  private localLimit = visibleBatch;
  private readonly ruleLimits = new Map<string, number>();

  protected override heading() {
    return 'Registered rules';
  }

  protected override async read(signal: AbortSignal): Promise<Registry> {
    const controller = new AbortController();
    const request = AbortSignal.any([signal, controller.signal]);
    try {
      const [sets, rules] = await Promise.all([
        readPages(registeredRuleSets, request),
        readPages(registeredRules, request),
      ]);
      const groups = new Map<string, SetGroup>();
      for (const set of sets) {
        const key = setKey(set);
        groups.set(key, { key, label: set.name, set, rules: [], repositories: [], incomplete: false });
      }
      const local = new Map<string, RuleGroup>();
      for (const rule of rules) {
        if (sets.length && rule.rule_sets === undefined) throw new ApiError('ledger_unavailable');
        if (rule.rule_sets?.length) {
          for (const membership of rule.rule_sets) {
            const group = groups.get(setKey(membership));
            // A registration can change between the two scans. Retry from fresh cursors.
            if (!group) throw new ApiError('ledger_unavailable');
            group.rules.push(rule);
          }
        } else {
          const key = rule.source;
          const group = local.get(key) ?? { key, label: key, rules: [] };
          group.rules.push(rule);
          local.set(key, group);
        }
      }
      const setGroups = [...groups.values()];
      for (let start = 0; start < setGroups.length; start += complianceConcurrency) {
        await Promise.all(setGroups.slice(start, start + complianceConcurrency).map(async group => {
          const bindings = await ruleSetCompliance(group.set, request);
          group.repositories = [...new Set(bindings.map(binding => binding.repository))];
          group.incomplete = bindings.some(binding => !binding.complete);
        }));
      }
      return { sets: setGroups, local: [...local.values()].sort((a, b) => a.label.localeCompare(b.label)) };
    } catch (error) {
      // The ledger can reject a cursor when an earlier registration becomes visible mid-scan.
      if (error instanceof ApiError && error.code === 'invalid_query') throw new ApiError('ledger_unavailable');
      throw error;
    } finally {
      controller.abort();
    }
  }

  private filterChanged(event: Event, field: 'query' | 'kind' | 'scope') {
    this[field] = (event.currentTarget as HTMLInputElement | HTMLSelectElement).value;
    this.setLimit = this.localLimit = visibleBatch;
    this.ruleLimits.clear();
    this.requestUpdate();
  }

  private matching(groups: (RuleGroup | SetGroup)[], terms: string[]) {
    return groups.flatMap(group => {
      const fields = 'set' in group
        ? [group.label, group.set.id, group.set.source, ...group.repositories]
        : [group.label];
      const groupFields = fields.map(field => field.toLowerCase());
      const unmatched = terms.filter(term => !groupFields.some(field => field.includes(term)));
      const rules = group.rules.filter(rule => {
        if (this.kind && this.kind !== rule.kind) return false;
        const ruleFields = [rule.name, rule.id, rule.source];
        return unmatched.every(term => ruleFields.some(field => field?.toLowerCase().includes(term)));
      });
      return rules.length || (!this.kind && unmatched.length === 0) ? [{ ...group, rules }] : [];
    });
  }

  private renderGroup(group: RuleGroup | SetGroup, open: boolean) {
    const setGroup = 'set' in group ? group : undefined;
    const ruleLimit = this.ruleLimits.get(group.key) ?? visibleBatch;
    const rows = group.rules.slice(0, ruleLimit).map(rule => {
      const href = rulePath(rule);
      return {
        key: href,
        cells: [
          html`<a data-route href=${href}>${rule.name || rule.id}</a>`,
          rule.owner ?? '—',
          rule.description ?? '',
        ],
      };
    });
    return html`
      <details class=${setGroup ? 'set' : 'local'} ?open=${open}>
        <summary>
          <strong>${setGroup
            ? html`<a data-route href=${ruleSetPath(setGroup.set)}>${group.label}</a>`
            : group.label}</strong>
          ${setGroup ? html`
            <span class="facts">
              <span>Version ${setGroup.set.version}</span>
              <span>${countLabel(setGroup.set.member_count, 'rule', 'rules')}</span>
              <span>${countLabel(setGroup.repositories.length, 'repository', 'repositories')}</span>
              ${setGroup.incomplete ? html`<span class="incomplete">Repository not compliant</span>` : nothing}
            </span>
          ` : nothing}
        </summary>
        <div class="group-content">
          ${setGroup?.set.description ? html`<p>${setGroup.set.description}</p>` : nothing}
          ${rows.length ? html`
            <pb-data-table .label=${`Rules in ${group.label}`} .columns=${columns} .rows=${rows}
              row-header-column="0"></pb-data-table>
          ` : html`<p>No matching latest rule registrations.</p>`}
          ${ruleLimit < group.rules.length ? html`
            <button class="more" type="button" aria-label=${`Show more rules in ${group.label}`}
              @click=${() => {
                this.ruleLimits.set(group.key, ruleLimit + visibleBatch);
                this.requestUpdate();
              }}>Show more rules</button>
          ` : nothing}
        </div>
      </details>
    `;
  }

  protected override content(data?: Registry) {
    if (!data) return html``;
    const query = this.query.trim().toLowerCase();
    const terms = query ? query.split(/\s+/) : [];
    const sets = this.scope === 'local' ? [] : this.matching(data.sets, terms);
    const local = this.scope === 'set' ? [] : this.matching(data.local, terms);
    return html`
      <div class="filters" role="group" aria-label="Filter registered rules">
        <label>Search rules
          <input type="search" @input=${(event: Event) => this.filterChanged(event, 'query')}>
        </label>
        <label>Kind
          <select @change=${(event: Event) => this.filterChanged(event, 'kind')}>
            <option value="">All kinds</option>
            <option value="check">Check</option>
            <option value="review">Review</option>
          </select>
        </label>
        <label>Scope
          <select @change=${(event: Event) => this.filterChanged(event, 'scope')}>
            <option value="">All scopes</option>
            <option value="set">Rule Sets</option>
            <option value="local">Local rules</option>
          </select>
        </label>
      </div>
      <p class="assistive" role="status">${countLabel(sets.length + local.length, 'matching group', 'matching groups')}</p>
      ${sets.length || local.length ? nothing : html`
        <pb-empty-state
          heading=${data.sets.length || data.local.length ? 'No matching rules' : 'No rules'}
          message=${data.sets.length || data.local.length ? 'Try changing the search or filters.' : 'No rules or Rule Sets have been registered yet.'}>
        </pb-empty-state>
      `}
      ${sets.length ? html`
        <section aria-labelledby="set-heading">
          <h2 id="set-heading">Rule Sets</h2>
          ${keyed(query, repeat(sets.slice(0, this.setLimit), group => group.key, group => this.renderGroup(group, !!query)))}
          ${this.setLimit < sets.length ? html`<button class="more" type="button" @click=${() => {
            this.setLimit += visibleBatch;
            this.requestUpdate();
          }}>Show more Rule Sets</button>` : nothing}
        </section>
      ` : nothing}
      ${local.length ? html`
        <section aria-labelledby="local-heading">
          <h2 id="local-heading">Local rules</h2>
          ${keyed(query, repeat(local.slice(0, this.localLimit), group => group.key, group => this.renderGroup(group, !!query)))}
          ${this.localLimit < local.length ? html`<button class="more" type="button" @click=${() => {
            this.localLimit += visibleBatch;
            this.requestUpdate();
          }}>Show more repositories</button>` : nothing}
        </section>
      ` : nothing}
    `;
  }
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

customElements.define('pb-rules', RulesView);
