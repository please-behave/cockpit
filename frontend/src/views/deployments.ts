import { css, html, nothing, type CSSResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { deployments, type Deployment } from '../api/client';
import '../components/pb-empty-state';
import '../components/pb-status-pill';
import { CockpitView } from './cockpit-view';
import {
  compareEvidence, deploymentList, deploymentListStyles, evidenceStatus, statuses, targetKey, targetLabel,
} from './deployment-list';

type GroupBy = 'target' | 'repository';

function groupDeployments(entries: Deployment[], groupBy: GroupBy) {
  const groups = new Map<string, { key: string; label: string; rows: Deployment[] }>();
  for (const entry of entries) {
    const byTarget = groupBy === 'target';
    const key = byTarget ? targetKey(entry.target) : entry.repository;
    const group = groups.get(key);
    if (group) {
      group.rows.push(entry);
    } else {
      groups.set(key, { key, label: byTarget ? targetLabel(entry.target) : entry.repository, rows: [entry] });
    }
  }
  return [...groups.values()].sort((a, b) => compareEvidence(a.rows[0], b.rows[0]) || a.label.localeCompare(b.label));
}

export class DeploymentsView extends CockpitView<Deployment[]> {
  static override styles = [CockpitView.styles as CSSResult, deploymentListStyles, css`
    @layer components {
      :host { overflow-wrap: anywhere; }

      .controls {
        padding: var(--panel-padding);
        border: 1px solid var(--panel-border);
        border-radius: var(--radius-panel);
        background: var(--surface-raised);
      }

      .controls {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--space-3) var(--space-4);
      }

      label {
        display: grid;
        gap: var(--space-1);
        font-weight: var(--weight-semibold);
      }

      select {
        min-inline-size: 0;
        min-block-size: var(--target-min-size);
        padding: var(--control-padding-block) var(--control-padding-inline);
        border: 1px solid var(--border);
        border-radius: var(--radius-control);
        background: var(--surface);
        color: var(--text);
        font: inherit;
      }

      section { margin-block-start: var(--space-6); }

      header {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-2) var(--space-4);
        margin-block-end: var(--space-2);
      }

      h2, p { margin: 0; }

      @media (max-width: 52rem) {
        .controls { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      @media (max-width: 28rem) {
        .controls { grid-template-columns: minmax(0, 1fr); }
      }
    }
  `];

  private groupBy: GroupBy = 'target';
  private target = '';
  private repository = '';
  private evidence = '';

  protected override get headingVisible() { return false; }
  protected override heading() { return 'Deployments'; }
  protected override read(signal: AbortSignal) { return deployments(signal); }

  private change(event: Event, field: 'groupBy' | 'target' | 'repository' | 'evidence') {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (field === 'groupBy') this.groupBy = value === 'repository' ? 'repository' : 'target';
    else this[field] = value;
    this.requestUpdate();
  }

  private controls(entries: Deployment[]) {
    const targets = new Map(entries.map(({ target }) => [targetKey(target), targetLabel(target)]));
    const repositories = new Set(entries.map(entry => entry.repository));
    return html`
      <div class="controls" role="group" aria-label="Group and filter deployments">
        <label>Group by
          <select @change=${(event: Event) => this.change(event, 'groupBy')}>
            <option value="target">Target</option>
            <option value="repository">Repository</option>
          </select>
        </label>
        <label>Target
          <select @change=${(event: Event) => this.change(event, 'target')}>
            <option value="">All targets</option>
            ${[...targets].sort((a, b) => a[1].localeCompare(b[1])).map(([key, label]) =>
              html`<option value=${key}>${label}</option>`)}
          </select>
        </label>
        <label>Repository
          <select @change=${(event: Event) => this.change(event, 'repository')}>
            <option value="">All repositories</option>
            ${[...repositories].sort((a, b) => a.localeCompare(b)).map(repository =>
              html`<option value=${repository}>${repository}</option>`)}
          </select>
        </label>
        <label>Evidence status
          <select @change=${(event: Event) => this.change(event, 'evidence')}>
            <option value="">All evidence statuses</option>
            ${statuses.map(status => html`<option value=${status}>${status}</option>`)}
          </select>
        </label>
      </div>`;
  }

  protected override content(entries?: Deployment[]) {
    if (!entries) return html``;
    if (entries.length === 0) return html`<pb-empty-state heading="No deployments"
      message="No deployment has been recorded yet."></pb-empty-state>`;

    const matching = entries.filter(entry =>
      (!this.target || targetKey(entry.target) === this.target) &&
      (!this.repository || entry.repository === this.repository) &&
      (!this.evidence || evidenceStatus(entry) === this.evidence),
    ).sort((a, b) => compareEvidence(a, b) || a.repository.localeCompare(b.repository)
      || targetLabel(a.target).localeCompare(targetLabel(b.target)));
    const groups = groupDeployments(matching, this.groupBy);
    return html`
      ${this.controls(entries)}
      <p class="assistive" role="status">${matching.length} matching ${matching.length === 1 ? 'deployment' : 'deployments'}</p>
      ${groups.length > 0 ? nothing : html`<pb-empty-state heading="No matching deployments"
        message="Try changing the filters."></pb-empty-state>`}
      ${repeat(groups, group => group.key, ({ label, rows }, index) => {
        const status = evidenceStatus(rows[0]);
        const count = rows.filter(row => evidenceStatus(row) === status).length;
        return html`<section aria-labelledby=${`deployment-group-${index}`}>
          <header>
            <h2 id=${`deployment-group-${index}`}>${label}</h2>
            <p><pb-status-pill .status=${status}></pb-status-pill> ${count} of ${rows.length}</p>
          </header>
          ${deploymentList(rows, 'repository')}
        </section>`;
      })}
    `;
  }
}

customElements.define('pb-deployments', DeploymentsView);
