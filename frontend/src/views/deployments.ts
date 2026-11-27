import { css, html, type CSSResult } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { deployments, type Deployment } from '../api/client';
import '../components/pb-empty-state';
import { CockpitView } from './cockpit-view';
import {
  compareEvidence, deploymentTableStyles, evidenceStatus, groupedDeploymentTable, statuses, targetKey, targetLabel,
  type DeploymentGroup,
} from './deployment-table';

type GroupBy = 'target' | 'repository';

function groupDeployments(entries: Deployment[], groupBy: GroupBy) {
  const groups = new Map<string, DeploymentGroup>();
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
  static override styles = [CockpitView.styles as CSSResult, deploymentTableStyles, css`
    @layer components {
      :host { overflow-wrap: anywhere; overflow-anchor: none; }

      .controls {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--space-3) var(--space-4);
      }

      label {
        display: grid;
        gap: var(--space-1);
      }

      select { min-inline-size: 0; }

      pb-data-table { margin-block-start: var(--space-4); }

      p { margin: 0; }

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
  private selectedTargetLabel = '';
  private repository = '';
  private evidence = '';

  protected override readonly refreshable = true;
  protected override get headingVisible() { return false; }
  protected override heading() { return 'Deployments'; }
  protected override read(signal: AbortSignal) { return deployments(signal); }

  private change(event: Event, field: 'groupBy' | 'target' | 'repository' | 'evidence') {
    const select = event.currentTarget as HTMLSelectElement;
    const { value } = select;
    if (field === 'target') this.selectedTargetLabel = select.selectedOptions[0]?.textContent ?? '';
    if (field === 'groupBy') this.groupBy = value === 'repository' ? 'repository' : 'target';
    else this[field] = value;
    this.requestUpdate();
  }

  private controls(entries: Deployment[]) {
    const targets = new Map(entries.map(({ target }) => [targetKey(target), targetLabel(target)]));
    const repositories = new Set(entries.map(entry => entry.repository));
    // An active filter can outlive the matching deployment.
    if (this.target && !targets.has(this.target)) targets.set(this.target, this.selectedTargetLabel);
    if (this.repository) repositories.add(this.repository);
    return html`
      <div class="controls panel" role="group" aria-label="Group and filter deployments">
        <label>Group by
          <select @change=${(event: Event) => this.change(event, 'groupBy')}>
            <option value="target">Target</option>
            <option value="repository">Repository</option>
          </select>
        </label>
        <label>Target
          <select @change=${(event: Event) => this.change(event, 'target')}>
            <option value="">All targets</option>
            ${repeat([...targets].sort((a, b) => a[1].localeCompare(b[1])), ([key]) => key, ([key, label]) =>
              html`<option value=${key}>${label}</option>`)}
          </select>
        </label>
        <label>Repository
          <select @change=${(event: Event) => this.change(event, 'repository')}>
            <option value="">All repositories</option>
            ${repeat([...repositories].sort((a, b) => a.localeCompare(b)), repository => repository, repository =>
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
    const hasSelection = this.groupBy !== 'target' || this.target || this.repository || this.evidence;
    const matching = entries.filter(entry =>
      (!this.target || targetKey(entry.target) === this.target) &&
      (!this.repository || entry.repository === this.repository) &&
      (!this.evidence || evidenceStatus(entry) === this.evidence),
    ).sort((a, b) => compareEvidence(a, b) || a.repository.localeCompare(b.repository)
      || targetLabel(a.target).localeCompare(targetLabel(b.target)));
    const groups = groupDeployments(matching, this.groupBy);
    return html`
      ${entries.length || hasSelection ? this.controls(entries) : ''}
      <p class="assistive" role="status">${matching.length} matching ${matching.length === 1 ? 'deployment' : 'deployments'}</p>
      ${groups.length > 0 ? groupedDeploymentTable(groups, this.groupBy) : html`
        <pb-empty-state heading=${entries.length ? 'No matching deployments' : 'No deployments'}
          message=${entries.length ? 'Try changing the filters.' : 'No deployment has been recorded yet.'}></pb-empty-state>`}
    `;
  }
}

customElements.define('pb-deployments', DeploymentsView);
