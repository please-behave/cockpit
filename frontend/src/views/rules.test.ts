import { afterEach, expect, test, vi } from 'vitest';
import {
  rulePageSize, type RegisteredRule, type RegisteredRuleSet, type RuleSetCompliance,
} from '../api/client';
import { CockpitApp } from '../components/app';
import type { DataTable } from '../components/pb-data-table';
import { RulesView } from './rules';

const scan = { through: 1795334400123456, registrations: 300 };
const source = 'github.com/team/catalog+more';
const markup = '<img src=x onerror=alert(1)>';
const baseline = {
  source, path: 'sets/quality&security', id: 'baseline-id', name: `Baseline ${markup}`,
  version: '2.0', member_count: 3, description: markup, scan,
};
const release = { ...baseline, id: 'release', name: 'Release', member_count: 1, description: undefined };
const review: RegisteredRule = {
  source, path: 'rules/review', id: 'shared-id', name: 'Shared review', version: '3.0',
  kind: 'review', rule_sets: [baseline, release], owner: markup, description: markup, scan,
};
const check: RegisteredRule = {
  ...review, id: 'safety', name: 'Safety check', kind: 'check', rule_sets: [baseline],
};
const local: RegisteredRule[] = ['cli', 'gateway'].map(repo => ({
  ...check, source: `github.com/team/${repo}`, id: 'lint-id', name: 'Syntax',
  rule_sets: [], owner: undefined, description: undefined,
}));
const rules = [check, review, ...local];

const success: RuleSetCompliance = {
  repository: 'github.com/team/approved', version: '2.0', complete: true, registered: true, non_passing_members: [],
};
const failure: RuleSetCompliance = {
  ...success, repository: 'github.com/team/needs-work', version: '1.0', complete: false,
  non_passing_members: [{ source, path: review.path, id: review.id, version: review.version, status: 'WARN' }],
};

function mount(respond: (url: URL) => unknown = url => {
  switch (url.pathname) {
    case '/v0/rules': return rules;
    case '/v0/rule-sets': return [baseline, release];
    case '/v0/rule-sets/compliance': return url.searchParams.get('id') === baseline.id
      ? [success, failure, { ...failure, version: '2.0' }] : [];
    default: throw new Error(`Unexpected request ${url.pathname}`);
  }
}) {
  const fetch = vi.fn(async (path: string) => {
    const response = respond(new URL(path, window.location.origin));
    return response instanceof Response ? response : Response.json(response);
  });
  vi.stubGlobal('fetch', fetch);
  const view = new RulesView();
  document.body.append(view);
  return { view, fetch };
}

async function loaded(view: RulesView) {
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector('input')).not.toBeNull());
  return view.shadowRoot!;
}

function groups(root: ShadowRoot) {
  return [...root.querySelectorAll('details')];
}

function labels(root: ShadowRoot) {
  return groups(root).map(group => group.querySelector('summary strong')?.textContent);
}

function ruleNames(group: HTMLDetailsElement) {
  return (group.querySelector<DataTable>('pb-data-table')?.rows ?? []).map(row =>
    row.key && new URL(row.key, window.location.origin).searchParams.get('id'));
}

async function filter(view: RulesView, control: HTMLInputElement | HTMLSelectElement, value: string) {
  control.value = value;
  control.dispatchEvent(new Event(control instanceof HTMLInputElement ? 'input' : 'change'));
  await view.updateComplete;
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

// Verifies REQ-0020.
test('refreshes the registry and compliance together while preserving order and expanded rule batches', async () => {
  const members = Array.from({ length: 25 }, (_, index) => ({
    ...check, id: `rule-${index}`, name: `Check ${index}`, owner: 'Initial owner',
  }));
  let owner = 'Initial owner';
  let fail = false;
  const fetch = vi.fn(async (path: string) => {
    switch (new URL(path, window.location.origin).pathname) {
      case '/v0/rules': return Response.json(members.map(rule => ({ ...rule, owner })));
      case '/v0/rule-sets': return Response.json([baseline]);
      case '/v0/rule-sets/compliance':
        return fail ? Response.json({}, { status: 503 }) : Response.json([success]);
      default: throw new Error(`Unexpected request ${path}`);
    }
  });
  vi.stubGlobal('fetch', fetch);
  window.history.replaceState(null, '', '/rules');
  const app = new CockpitApp();
  document.body.append(app);
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<RulesView>('pb-rules')!;
  const root = await loaded(view);
  const search = root.querySelector('input')!;
  await filter(view, search, 'Check');
  const group = groups(root)[0];
  expect(group.open).toBe(true);
  expect(ruleNames(group)).toHaveLength(20);
  group.querySelector('button.more')!.dispatchEvent(new Event('click'));
  await view.updateComplete;
  const order = members.map(rule => rule.id);
  expect(ruleNames(group)).toEqual(order);
  const table = group.querySelector<DataTable>('pb-data-table')!;
  const refresh = app.shadowRoot!.querySelector('pb-app-shell')!.shadowRoot!
    .querySelector('pb-refresh-status')!.shadowRoot!.querySelector('button')!;

  owner = 'Updated owner';
  refresh.click();
  await vi.waitFor(() => expect(table.rows[0].cells[1]).toBe(owner));
  expect(ruleNames(group)).toEqual(order);
  expect(groups(root)[0]).toBe(group);
  expect(group.open).toBe(true);
  expect(search.value).toBe('Check');

  owner = 'Unconfirmed owner';
  fail = true;
  refresh.click();
  await vi.waitFor(() => expect(root.textContent).toContain('Showing the last data received'));
  expect(table.rows[0].cells[1]).toBe('Updated owner');
  expect(ruleNames(group)).toEqual(order);
  const requests = fetch.mock.calls.map(([path]) => path);
  expect(requests).toEqual([...requests.slice(0, 3), ...requests.slice(0, 3), ...requests.slice(0, 3)]);
});

// Verifies REQ-0004, REQ-0015, REQ-0025 and REQ-0026.
test('shows set facts and keeps same-name local rules in distinct collapsed groups', async () => {
  const { view, fetch } = mount();
  const root = await loaded(view);
  expect(labels(root)).toEqual([baseline.name, release.name, local[0].source, local[1].source]);
  const [baselineGroup, releaseGroup, cli, gateway] = groups(root);
  expect(baselineGroup.className).toBe('disclosure set');
  expect(baselineGroup.querySelector('summary')?.textContent).toMatch(/Version 2\.0\s+3 rules\s+2 repositories/);
  expect(releaseGroup.querySelector('summary')?.textContent).toMatch(/1 rule\s+0 repositories/);
  expect(baselineGroup.querySelector('summary pb-status-pill')).toHaveProperty('status', 'Repository not compliant');
  expect(releaseGroup.querySelector('summary pb-status-pill')).toBeNull();
  expect(ruleNames(baselineGroup)).toEqual(['safety', 'shared-id']);
  expect(ruleNames(releaseGroup)).toEqual(['shared-id']);
  for (const [index, group] of [cli, gateway].entries()) {
    expect(group.className).toBe('disclosure local');
    expect(group.open).toBe(false);
    group.querySelector('summary')!.click();
    expect(group.open).toBe(true);
    const table = group.querySelector<DataTable>('pb-data-table')!;
    await table.updateComplete;
    const link = table.shadowRoot!.querySelector<HTMLAnchorElement>('tbody a')!;
    expect(link.textContent).toBe('Syntax');
    expect(new URL(link.href).searchParams.get('source')).toBe(local[index].source);
  }
  const table = baselineGroup.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  expect([...table.shadowRoot!.querySelectorAll('thead th')].map(cell => [cell.textContent, cell.getAttribute('part')]))
    .toEqual([['Rule', 'rule-name'], ['Owner', 'rule-owner'], ['Description', 'rule-description']]);
  expect(table.shadowRoot!.querySelector('[part="rule-owner"]:is(td)')?.textContent).toBe(markup);
  expect(root.querySelector('img, [onerror]')).toBeNull();
  expect(table.shadowRoot!.querySelector('img, [onerror]')).toBeNull();
  expect(fetch.mock.calls.some(([path]) => path ===
    '/v0/rule-sets/compliance?source=github.com%2Fteam%2Fcatalog%2Bmore&path=sets%2Fquality%26security&id=baseline-id')).toBe(true);
});

// Verifies REQ-0015 and REQ-0026.
test('matches names, local IDs and repositories and combines the labeled native filters', async () => {
  const { view, fetch } = mount();
  const root = await loaded(view);
  const search = root.querySelector('input')!;
  const [kind, scope] = [...root.querySelectorAll('select')];
  expect([search, kind, scope].map(control => control.labels?.[0].firstChild?.textContent?.trim()))
    .toEqual(['Search rules', 'Kind', 'Scope']);
  search.focus();
  await filter(view, search, ' bAsELine SHARED-ID ');
  expect(labels(root)).toEqual([baseline.name]);
  expect(groups(root)[0].open).toBe(true);
  expect(ruleNames(groups(root)[0])).toEqual(['shared-id']);
  expect(root.activeElement).toBe(search);
  await filter(view, search, 'needs-work');
  expect(labels(root)).toEqual([baseline.name]);
  await filter(view, kind, 'review');
  expect(ruleNames(groups(root)[0])).toEqual(['shared-id']);
  await filter(view, scope, 'local');
  expect(root.querySelector('[role=status]')?.textContent).toBe('0 matching groups');
  await filter(view, kind, 'check');
  await filter(view, search, 'SYNTAX gateway');
  expect(labels(root)).toEqual([local[1].source]);
  expect(groups(root)[0].open).toBe(true);
  await filter(view, scope, 'set');
  expect(labels(root)).toEqual([]);
  await filter(view, search, '');
  expect(labels(root)).toEqual([baseline.name]);
  expect(fetch).toHaveBeenCalledTimes(4);
});

// Verifies REQ-0025 and REQ-0026.
test('continues both registries independently and searches across page and render boundaries', async () => {
  const pageOneRules = Array.from({ length: rulePageSize }, (_, index) => ({
    ...local[0], source: `github.com/team/repository-${String(index).padStart(3, '0')}`,
    id: String(index), version: '1.0', name: `Audit ${index}`,
  }));
  const pageOneSets: RegisteredRuleSet[] = Array.from({ length: rulePageSize }, (_, index) => ({
    ...release, id: `set-${index}`, name: `Set ${index}`, scan: { through: 1234, registrations: 101 },
  }));
  const laterRule = { ...local[0], name: 'Zebra' };
  const laterSet = { ...release, name: 'Zebra set' };
  const { view, fetch } = mount(url => {
    if (url.pathname.endsWith('/compliance')) return [];
    const isRules = url.pathname === '/v0/rules';
    return url.searchParams.has('before') ? [isRules ? laterRule : laterSet] : isRules ? pageOneRules : pageOneSets;
  });
  const root = await loaded(view);
  expect(root.querySelectorAll('.set')).toHaveLength(20);
  expect(root.querySelectorAll('.local')).toHaveLength(20);
  root.querySelector<HTMLButtonElement>('#local-heading ~ button')!.click();
  await view.updateComplete;
  expect(root.querySelectorAll('.local')).toHaveLength(40);
  await filter(view, root.querySelector('input')!, 'zebra');
  expect(labels(root)).toEqual(['Zebra set', laterRule.source]);
  expect(groups(root).every(group => group.open)).toBe(true);
  const calls = fetch.mock.calls.map(([path]) => new URL(path, window.location.origin));
  for (const [path, page] of [['/v0/rules', pageOneRules], ['/v0/rule-sets', pageOneSets]] as const) {
    const { source, path: rulePath, id, version, scan } = page.at(-1)!;
    const cursor = calls.find(url => url.pathname === path && url.searchParams.has('before'))!.searchParams.get('before')!;
    expect(JSON.parse(cursor)).toEqual({ source, path: rulePath, id, version, scan });
  }
});

test('can retry after a ledger cursor is invalidated', async () => {
  const { view } = mount(url => url.pathname === '/v0/rules'
    ? Response.json({ code: 'invalid_query' }, { status: 400 }) : []);
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector('pb-error-state')?.getAttribute('heading'))
    .toBe('Ledger unavailable'));
  expect(view.shadowRoot?.querySelector('pb-error-state')?.hasAttribute('retryable')).toBe(true);
});
