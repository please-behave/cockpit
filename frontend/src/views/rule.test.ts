import { afterEach, expect, test, vi } from 'vitest';
import { type RegisteredRule, type RegisteredVersion } from '../api/client';
import { CockpitApp } from '../components/app';
import type { DataTable } from '../components/pb-data-table';
import type { RuleView } from './rule';
import type { RulesView } from './rules';

const identity = { source: 'github.com/team/catalog+more', path: '.please/checks/shell&tools', id: 'example' };
const markup = '<img src=x onerror=alert(1)>';
const prompt = `Review the build.\n${markup}`;
const ownerMarkup = '<b>release key</b>';
const registration = { ...identity, version: '1.10', kind: 'review' as const, name: markup, description: markup, owner: ownerMarkup };
const summary: RegisteredRule = { ...registration, scan: { through: 1795334400123456, registrations: 254 } };
const history: RegisteredVersion[] = [
  { ...identity, version: '1.2', kind: 'check', name: 'Original check', description: 'First version',
    owner: 'github.com/team/registrations',
    digest: 'first', commit: 'a'.repeat(40), registered_at: '2026-11-20T09:00:00Z',
    knowledge: { purpose: 'Check the build', unknown: markup, conditions: [{ statement: 'Use locked tools' }] } },
  { ...registration, digest: 'second', commit: 'b'.repeat(40), registered_at: '2026-11-22T09:00:00Z',
    kind: 'review', blocking: false, prompt,
    knowledge: {
      purpose: 'Review the build', problem: 'Unstable builds', value: 'Predictable runs',
      conditions: [{ statement: 'Build runs once', rationale: markup }, null],
      success_criteria: ['Detect broken builds'], out_of_scope: [{ description: 'Deployment', owner: 'deploy' }],
      limitations: ['Static inspection'], placement: 'Shared catalog', references: [markup],
      future: { nested: markup },
    } },
];

function open(path: string) {
  window.history.replaceState(null, '', path);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const app = new CockpitApp();
  document.body.append(app);
  return app;
}

async function tableFrom(view: RulesView) {
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector('pb-data-table')).not.toBeNull());
  const table = view.shadowRoot!.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  return table.shadowRoot!;
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Verifies REQ-0004, REQ-0025 and REQ-0026.
test('opens a registered rule and shows the newest version and switches to an older version with escaped text', async () => {
  const fetch = vi.fn(async (path: string) => Response.json(
    path.startsWith('/v0/rule-sets?') ? []
      : path.startsWith('/v0/rules/detail?') ? history
      : [summary, { ...summary, id: 'unnamed', name: undefined, owner: undefined }],
  ));
  vi.stubGlobal('fetch', fetch);

  const app = open('/rules');
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<RulesView>('pb-rules')!;
  const table = await tableFrom(view);
  view.shadowRoot!.querySelector('details')!.open = true;
  expect(view.shadowRoot!.querySelector('h1')?.classList.contains('assistive')).toBe(true);
  const rows = [...table.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('td:last-child')?.textContent).toBe(markup);
  expect(rows.map(row => row.querySelector('[part="rule-owner"]')?.textContent)).toEqual([ownerMarkup, '—']);
  expect(rows[1].querySelector('a')?.textContent).toBe('unnamed');
  expect(rows[0].querySelector('a')?.textContent).toBe(markup);
  expect(table.querySelector('b, img, [onerror]')).toBeNull();
  rows[0].querySelector('a')!.click();
  await app.updateComplete;

  const detail = app.shadowRoot!.querySelector<RuleView>('pb-rule')!;
  const root = detail.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(1));
  expect(root.querySelector('h1')?.textContent).toBe(markup);
  expect(root.querySelector('h1')?.classList.contains('assistive')).toBe(false);
  expect([...root.children].slice(0, 4).map(element => element.localName))
    .toEqual(['h1', 'p', 'pb-fact-strip', 'dl']);
  expect(root.querySelector('.introduction')?.textContent).toBe(markup);
  const facts = root.querySelector('pb-fact-strip')!.shadowRoot!;
  expect([...facts.querySelectorAll('dt')].map(term => term.textContent)).toEqual(['Kind', 'Blocking', 'Registered']);
  expect([...facts.querySelectorAll('pb-badge')].map(badge => [badge.textContent, badge.getAttribute('tone')]))
    .toEqual([['review', 'review'], ['Non-blocking', 'neutral']]);
  expect(facts.querySelector('pb-time')?.shadowRoot?.querySelector('time')?.dateTime)
    .toBe('2026-11-22T09:00:00Z');
  expect([...root.querySelectorAll('.identity dt')].map(term =>
    [term.textContent, term.nextElementSibling?.textContent?.trim()]))
    .toEqual([['Repository', 'catalog+more'], ['Path', identity.path], ['Rule ID', identity.id]]);
  expect(root.querySelector('.identity pb-tooltip')?.shadowRoot?.querySelector('[role=tooltip]')?.textContent?.trim())
    .toBe(identity.source);
  const select = root.querySelector('select')!;
  expect(select.labels?.[0].textContent?.trim().split(/\s+/)[0]).toBe('Version');
  expect(select.value).toBe('1.10');
  const optionTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  expect([...select.options].map(option => option.textContent)).toEqual([
    `1.10 · ${optionTime.format(new Date(history[1].registered_at))} · Latest`,
    `1.2 · ${optionTime.format(new Date(history[0].registered_at))}`,
  ]);
  expect(root.querySelector('h2')?.textContent).toBe('Version 1.10');
  expect(root.querySelector('pb-panel')?.hasAttribute('accent')).toBe(true);
  expect([...root.querySelectorAll('article pb-badge')].map(badge => [badge.textContent, badge.getAttribute('tone')]))
    .toEqual([['Latest', null], ['review', 'review'], ['Non-blocking', 'neutral']]);
  const fields = () => Object.fromEntries([...root.querySelectorAll('article dt')].map(term =>
    [term.textContent, term.nextElementSibling?.textContent?.trim()]));
  const latest = fields();
  expect(latest).toMatchObject({
    Description: markup, Owner: ownerMarkup, Prompt: prompt, Blocking: 'Non-blocking', Purpose: 'Review the build',
    Problem: 'Unstable builds', Value: 'Predictable runs', Conditions: expect.stringContaining(markup),
    'Success criteria': 'Detect broken builds', 'Out of scope': expect.stringContaining('Rule deploy'),
    Limitations: 'Static inspection', Placement: 'Shared catalog', References: markup,
  });
  expect(latest).not.toHaveProperty('future');
  expect(root.querySelector('article pb-time')?.shadowRoot?.querySelector('time')?.dateTime)
    .toBe('2026-11-22T09:00:00Z');
  expect(root.querySelector('b, img, [onerror]')).toBeNull();
  select.focus();
  select.value = '1.2';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  await app.updateComplete;
  await detail.updateComplete;

  expect(new URLSearchParams(window.location.search).get('version')).toBe('1.2');
  expect(root.activeElement).toBe(select);
  expect(root.querySelector('h1')?.textContent).toBe('Original check');
  expect(document.title).toBe('Original check | Please Behave');
  expect(root.querySelectorAll('article')).toHaveLength(1);
  expect(root.querySelector('h2')?.textContent).toBe('Version 1.2');
  expect(root.querySelector('pb-panel')?.hasAttribute('accent')).toBe(false);
  expect([...root.querySelectorAll('article pb-badge')].map(badge => badge.textContent)).toEqual(['check']);
  expect([...facts.querySelectorAll('dt')].map(term => term.textContent)).toEqual(['Kind', 'Registered']);
  const first = fields();
  expect(first).toMatchObject({
    Description: 'First version', Owner: 'github.com/team/registrations', Purpose: 'Check the build', Conditions: 'Use locked tools',
  });
  expect(first).not.toHaveProperty('References');
  expect(first).not.toHaveProperty('Prompt');
  expect(first).not.toHaveProperty('Blocking');
  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    '/v0/rule-sets?limit=100',
    '/v0/rules?limit=100',
    '/v0/rules/detail?source=github.com%2Fteam%2Fcatalog%2Bmore&path=.please%2Fchecks%2Fshell%26tools&id=example',
  ]);
});

// Verifies REQ-0026.
test('uses the local ID and omits absent optional fields for an unnamed check', async () => {
  const version = { ...history[0], name: undefined, description: undefined, owner: undefined };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([version])));
  const app = open(`/rules/detail?${new URLSearchParams(identity)}`);
  await app.updateComplete;
  const root = app.shadowRoot!.querySelector<RuleView>('pb-rule')!.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toBe(identity.id));
  expect(root.querySelector('.introduction')).toBeNull();
  expect(root.querySelector('select')).toBeNull();
  expect([...root.querySelectorAll('article dt')].map(term => term.textContent)).not.toContain('Owner');
  const facts = root.querySelector('pb-fact-strip')!.shadowRoot!;
  expect([...facts.querySelectorAll('dt')].map(term => term.textContent)).toEqual(['Kind', 'Registered']);
});

// Verifies REQ-0026 and REQ-0027.
test('deep links to the selected version without changing the ledger query', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(history));
  vi.stubGlobal('fetch', fetch);
  const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  try {
    const query = new URLSearchParams({ ...identity, version: '1.2' });
    const app = open(`/rules/detail?${query}`);
    await app.updateComplete;
    const root = app.shadowRoot!.querySelector<RuleView>('pb-rule')!.shadowRoot!;
    await vi.waitFor(() => expect(root.activeElement?.textContent).toBe('Version 1.2'));
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(root.querySelector('h1')?.textContent).toBe('Original check');
    expect(root.querySelectorAll('article')).toHaveLength(1);
    expect(root.querySelector('select')?.value).toBe('1.2');
    expect(fetch.mock.calls[0][0]).not.toContain('version=');
  } finally {
    if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});

// Verifies REQ-0004 and REQ-0026.
test('shows an escaped notice and defaults to the newest when the requested version is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(history)));
  const app = open(`/rules/detail?${new URLSearchParams({ ...identity, version: markup })}`);
  await app.updateComplete;
  const root = app.shadowRoot!.querySelector<RuleView>('pb-rule')!.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelector('p > code')?.textContent).toBe(markup));
  expect(root.querySelector('p:has(> code)')?.textContent).toBe(`Version ${markup} is unavailable.`);
  expect(root.querySelector('select')?.value).toBe('1.10');
  expect(root.querySelectorAll('article')).toHaveLength(1);
  expect(root.querySelector('img, [onerror]')).toBeNull();
});
