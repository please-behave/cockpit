// Verifies REQ-0016, REQ-0030 and REQ-0034.
import { html, render } from 'lit';
import { afterEach, expect, test, vi } from 'vitest';
import type { Deployment, ReleaseSummary } from '../api/client';
import type { DataTable } from '../components/pb-data-table';
import type { Tooltip } from '../components/pb-tooltip';
import { groupedDeploymentTable, repositoryDeploymentTable } from './deployment-table';
import { releaseTable } from './releases';

const repository = 'acme/project';
const fullCommit = 'a'.repeat(40);
const shortCommit = fullCommit.slice(0, 7);
const release = {
  repository, version: '2.0', commit: fullCommit, sender: 'ci',
  auth_method: 'github_oidc', received_at: '2026-11-27T12:00:00Z', evidence: null,
} satisfies ReleaseSummary;
const deployment = {
  ...release, id: '1', target: { owner: 'github.com/acme/infra', name: 'production' },
  state: 'no_evidence', reported_commit: null,
} satisfies Deployment;

const resized = new Map<Element, ResizeObserverCallback>();

afterEach(() => {
  document.body.replaceChildren();
  resized.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function valueIn(template: ReturnType<typeof html>, column: number) {
  const container = document.createElement('div');
  document.body.append(container);
  render(template, container);
  const table = container.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  const row = table.shadowRoot!.querySelector<HTMLTableRowElement>('tbody tr:has(td)')!;
  const tooltip = row.cells[column].querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  const root = tooltip.shadowRoot!;
  const trigger = tooltip.querySelector('a') ?? root.querySelector<HTMLElement>('.value')!;
  const popup = root.querySelector<HTMLElement>('[role="tooltip"]')!;
  return { tooltip, trigger, popup };
}

test.each([
  ['release repository', releaseTable([release], 'Releases'), 0, repository],
  ['release version', releaseTable([release], 'Releases'), 1, release.version],
  ['release history version', releaseTable([release], 'Release history'), 0, release.version],
  ['deployment repository', groupedDeploymentTable([{ key: 'production', label: 'production', rows: [deployment] }], 'target'), 0, repository],
  ['deployment version link', repositoryDeploymentTable([deployment]), 1, release.version],
  ['unrecorded deployment version', repositoryDeploymentTable([{ ...deployment, state: 'release_not_recorded', commit: null }]), 1, release.version],
  ['deployment target', repositoryDeploymentTable([deployment]), 0, 'github.com/acme/infra · production'],
] as const)('%s reveals the full text only while clipped', async (_name, template, column, full) => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { resized.set(target, this.callback); }
    unobserve(target: Element) { resized.delete(target); }
    disconnect() {}
  });
  const { trigger, popup } = await valueIn(template, column);
  const observe = resized.get(trigger)!;
  const clientWidth = vi.spyOn(trigger, 'clientWidth', 'get').mockReturnValue(100);
  vi.spyOn(trigger, 'scrollWidth', 'get').mockReturnValue(100);
  const resize = async () => {
    observe([{
      target: trigger, contentRect: new DOMRect(), borderBoxSize: [],
      contentBoxSize: [], devicePixelContentBoxSize: [],
    }], {} as ResizeObserver);
    await Promise.resolve();
  };
  const link = trigger instanceof HTMLAnchorElement;
  trigger.focus();
  expect(popup.hidden).toBe(true);
  expect(trigger.tabIndex).toBe(link ? 0 : -1);

  clientWidth.mockReturnValue(60);
  await resize();
  expect(trigger.tabIndex).toBe(0);
  trigger.focus();
  expect(popup.hidden).toBe(false);
  expect(popup.textContent?.trim()).toBe(full);

  clientWidth.mockReturnValue(100);
  await resize();
  expect(popup.hidden).toBe(true);
  expect(trigger.tabIndex).toBe(link ? 0 : -1);
});

test.each([
  ['release history', (commit: string) => releaseTable([{ ...release, commit }], 'Release history')],
  ['deployment', (commit: string) => repositoryDeploymentTable([{ ...deployment, version: null, reported_commit: commit, commit }])],
] as const)('%s shows a commit popup only if characters are omitted', async (_name, table) => {
  const shortened = await valueIn(table(fullCommit), 1);
  expect(shortened.trigger.getAttribute('aria-describedby')).toBe(shortened.popup.id);
  shortened.trigger.focus();
  expect(shortened.popup.hidden).toBe(false);
  expect(shortened.popup.textContent?.trim()).toBe(fullCommit);

  const complete = await valueIn(table(shortCommit), 1);
  expect(complete.trigger.tabIndex).toBe(-1);
  expect(complete.trigger.getAttribute('aria-describedby')).toBeNull();
  expect(complete.popup.hidden).toBe(true);
});
