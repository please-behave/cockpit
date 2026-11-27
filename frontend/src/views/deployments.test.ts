// Verifies REQ-0004, REQ-0015, REQ-0016 and REQ-0034.
import { afterEach, expect, test, vi } from 'vitest';
import { CockpitApp } from '../components/app';
import type { RelativeTime } from '../components/pb-relative-time';
import type { RuleSetChip } from '../components/pb-rule-set-chip';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { respond } from '../../../tools/preview/fixtures.mjs';
import type { DeploymentsView } from './deployments';
import { releasePath, repositoryPath } from './router';

const repository = 'github.com/acme/return-navigation';
const owner = 'github.com/acme/infrastructure';
const production = JSON.stringify([owner, 'production']);

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockPreview() {
  const fetch = vi.fn(async (path: string) => {
    const { body, status } = respond(path)!;
    return Response.json(body, { status });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function open() {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', '/deployments');
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<DeploymentsView>('pb-deployments')!;
  await view.updateComplete;
  return { app, view, root: view.shadowRoot! };
}

function facts(container: ParentNode) {
  return [...container.querySelectorAll('pb-key-value')].map(list => list.shadowRoot!);
}

function statuses(container: ParentNode) {
  return facts(container).map(list => list.querySelector<StatusPill>('pb-status-pill')!.status);
}

test('shows all pages grouped by target with the worst evidence first', async () => {
  const fetch = mockPreview();
  const { root } = await open();
  await vi.waitFor(() => expect(root.querySelectorAll('.deployment')).toHaveLength(115));
  expect(root.activeElement).toBe(root.querySelector('h1.assistive'));
  expect(root.querySelector('h1')?.textContent).toBe('Deployments');
  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    '/v0/deployments?limit=100', '/v0/deployments?limit=100&before=16',
  ]);
  const groups = [...root.querySelectorAll('section')];
  expect(groups.length).toBeGreaterThan(100);
  const group = groups[0];
  const heading = group.querySelector('pb-section > h2')!;
  expect(heading.textContent).toBe(owner + ' · production');
  expect(group.getAttribute('aria-labelledby')).toBe(heading.id);
  expect(group.querySelector('pb-section pb-status-pill')).toHaveProperty('status', 'ERROR');
  expect(group.querySelector('pb-section [slot=count]')?.textContent).toContain('1 of 4');
  expect(statuses(group)).toEqual(['ERROR', 'FAIL', 'No evidence', 'PASS']);
  expect(groups.some(group => group.querySelector('h2')?.textContent === 'github.com/acme/other-infrastructure · production')).toBe(true);

  const rows = [...root.querySelectorAll('.deployment')];
  expect(rows.some(row => row.querySelector('h3')!.textContent!.length > 100)).toBe(true);
  expect(facts(root).some(list => list.textContent!.includes('<img'))).toBe(true);
  expect(root.querySelector('img')).toBeNull();
  const pass = group.querySelector('.deployment:last-child')!;
  expect(pass.querySelector('h3 a')?.getAttribute('href')).toBe(repositoryPath(repository));
  const [passFacts] = facts(pass);
  expect(passFacts.querySelector('dl a')?.getAttribute('href')).toBe(releasePath(repository, '2.0'));
  expect([...passFacts.querySelectorAll<RuleSetChip>('pb-rule-set-chip')].map(chip => chip.label))
    .toEqual(['Repository baseline', expect.stringContaining('Security and release readiness')]);
  const time = passFacts.querySelector<RelativeTime>('pb-relative-time')!;
  await time.updateComplete;
  expect(time.shadowRoot?.querySelector('time')?.dateTime).toBe(time.value);

  const commit = facts(root).map(list => list.querySelector<Tooltip>('pb-tooltip')).find(Boolean)!;
  expect(commit.querySelector('code')?.textContent).toBe(commit.description.slice(0, 7));
  const missing = facts(root).find(list => list.querySelector('dd')?.textContent === 'v3.0')!;
  expect(missing.querySelector('pb-status-pill')).toHaveProperty('status', 'release not recorded');
  expect(missing.querySelector('dl a, pb-rule-set-chip')).toBeNull();
  for (const [status, icon] of [
    ['ERROR', 'error'], ['FAIL', 'cross'], ['release not recorded', 'circle'], ['No evidence', 'dash'], ['PASS', 'check'],
  ]) {
    const pill = facts(root).map(list => list.querySelector<StatusPill>('pb-status-pill')!).find(pill => pill.status === status)!;
    await pill.updateComplete;
    expect(pill.shadowRoot?.textContent).toContain(status);
    expect(pill.shadowRoot?.querySelector('pb-icon')?.getAttribute('name')).toBe(icon);
  }
});

test('changes grouping and combines labelled filters without losing focus', async () => {
  const fetch = mockPreview();
  const { view, root } = await open();
  await vi.waitFor(() => expect(root.querySelectorAll('select')).toHaveLength(4));
  const selects = [...root.querySelectorAll('select')];
  expect(selects.map(control => control.labels?.[0].firstChild?.textContent?.trim()))
    .toEqual(['Group by', 'Target', 'Repository', 'Evidence status']);
  expect(selects[0].value).toBe('target');

  async function change(control: HTMLSelectElement, value: string) {
    control.focus();
    control.value = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await view.updateComplete;
    expect(root.activeElement).toBe(control);
    expect(control.value).toBe(value);
  }

  await change(selects[0], 'repository');
  const repositoryGroup = [...root.querySelectorAll('section')].find(group => group.querySelector('h2')?.textContent === repository)!;
  expect(repositoryGroup.querySelectorAll('.deployment').length).toBeGreaterThan(100);
  await change(selects[1], production);
  expect(statuses(root)).toEqual(['ERROR', 'FAIL', 'No evidence', 'PASS']);
  await change(selects[2], repository);
  expect(statuses(root)).toEqual(['PASS']);
  expect(root.querySelector('[role="status"]')?.textContent).toBe('1 matching deployment');
  await change(selects[3], 'No evidence');
  expect(root.querySelector('pb-empty-state')?.getAttribute('heading')).toBe('No matching deployments');
  expect(root.querySelector('[role="status"]')?.textContent).toBe('0 matching deployments');
  await change(selects[2], '');
  expect(statuses(root)).toEqual(['No evidence']);
  expect(root.querySelector('pb-section pb-status-pill')).toHaveProperty('status', 'No evidence');
  await change(selects[1], '');
  await change(selects[3], 'release not recorded');
  expect(statuses(root)).toEqual(['release not recorded', 'release not recorded']);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('follows a recorded version link to its release detail', async () => {
  mockPreview();
  const { app, root } = await open();
  await vi.waitFor(() => expect(root.querySelector('.deployment')).not.toBeNull());
  const path = releasePath(repository, '2.0');
  facts(root).flatMap(list => [...list.querySelectorAll<HTMLAnchorElement>('dl a')]).find(link => link.getAttribute('href') === path)!.click();
  await app.updateComplete;
  expect(window.location.pathname + window.location.search).toBe(path);
  expect(app.shadowRoot!.querySelector('pb-release')).not.toBeNull();
});

test('explains an empty overview and allows retry after a failed read', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json([]));
  vi.stubGlobal('fetch', fetch);
  const { root } = await open();
  await vi.waitFor(() => expect(root.querySelector('pb-error-state')).not.toBeNull());
  root.querySelector('pb-error-state')!.dispatchEvent(new Event('retry'));
  await vi.waitFor(() => expect(root.querySelector('pb-empty-state')?.getAttribute('heading')).toBe('No deployments'));
  expect(root.querySelector('select')).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
