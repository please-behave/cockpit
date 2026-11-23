import { afterEach, expect, test, vi } from 'vitest';
import { type RegisteredRule, type RegisteredVersion, rulePageSize } from '../api/client';
import { CockpitApp } from '../components/app';
import type { DataTable } from '../components/pb-data-table';
import type { RuleView } from './rule';
import type { RulesView } from './rules';

const identity = { source: 'github.com/team/catalog+more', path: '.please/checks/shell&tools', id: 'example' };
const markup = '<img src=x onerror=alert(1)>';
const prompt = `Review the build.\n${markup}`;
const registration = { ...identity, version: '1.10', kind: 'review' as const, name: markup, description: markup };
const summary: RegisteredRule = { ...registration, scan: { through: 1795334400123456, registrations: 254 } };
const history: RegisteredVersion[] = [
  { ...identity, version: '1.2', kind: 'check', name: 'Original check', description: 'First version',
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

// Verifies REQ-0026.
test('shows the kind as a one-line badge and lets descriptions wrap', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([summary])));
  const app = open('/rules');
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<RulesView>('pb-rules')!;
  const table = await tableFrom(view);

  const headers = [...table.querySelectorAll('thead th')];
  const cells = [...table.querySelectorAll('tbody tr > *')];
  expect(headers.map(cell => cell.textContent)).toEqual(['Rule', 'Kind', 'Description']);
  expect(headers.map(cell => cell.className)).toEqual(['', 'content', '']);
  expect(cells.map(cell => cell.className)).toEqual(['', 'content', '']);
  expect(headers.map(cell => cell.getAttribute('part'))).toEqual(['rule-name', null, 'rule-description']);
  expect(cells.map(cell => cell.getAttribute('part'))).toEqual(['rule-name', null, 'rule-description']);
  expect(cells[1].querySelector('pb-badge')?.textContent).toBe('review');
});

// Verifies REQ-0004, REQ-0025 and REQ-0026.
test('opens a registered rule and shows the newest version and switches to an older version with escaped text', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([summary, { ...summary, id: 'unnamed', name: undefined }]))
    .mockResolvedValueOnce(Response.json(history));
  vi.stubGlobal('fetch', fetch);

  const app = open('/rules');
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<RulesView>('pb-rules')!;
  const table = await tableFrom(view);
  expect(view.shadowRoot!.querySelector('h1')?.classList.contains('assistive')).toBe(true);
  const rows = [...table.querySelectorAll('tbody tr')];
  expect(rows).toHaveLength(2);
  expect(rows[0].querySelector('td:last-child')?.textContent).toBe(markup);
  expect(rows[1].querySelector('a')?.textContent).toBe('unnamed');
  expect(rows[0].querySelector('a')?.textContent).toBe(markup);
  expect(table.querySelector('img, [onerror]')).toBeNull();
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
  expect([...facts.querySelectorAll('pb-badge')].map(badge => badge.textContent)).toEqual(['review', 'Non-blocking']);
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
  expect([...root.querySelectorAll('article pb-badge')].map(badge => badge.textContent))
    .toEqual(['Latest', 'review', 'Non-blocking']);
  const fields = () => Object.fromEntries([...root.querySelectorAll('article dt')].map(term =>
    [term.textContent, term.nextElementSibling?.textContent?.trim()]));
  const latest = fields();
  expect(latest).toMatchObject({
    Description: markup, Prompt: prompt, Blocking: 'Non-blocking', Purpose: 'Review the build',
    Problem: 'Unstable builds', Value: 'Predictable runs', Conditions: expect.stringContaining(markup),
    'Success criteria': 'Detect broken builds', 'Out of scope': expect.stringContaining('Rule deploy'),
    Limitations: 'Static inspection', Placement: 'Shared catalog', References: markup,
  });
  expect(latest).not.toHaveProperty('future');
  expect(root.querySelector('article pb-time')?.shadowRoot?.querySelector('time')?.dateTime)
    .toBe('2026-11-22T09:00:00Z');
  expect(root.querySelector('img, [onerror]')).toBeNull();
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
  expect(first).toMatchObject({ Description: 'First version', Purpose: 'Check the build', Conditions: 'Use locked tools' });
  expect(first).not.toHaveProperty('References');
  expect(first).not.toHaveProperty('Prompt');
  expect(first).not.toHaveProperty('Blocking');
  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    '/v0/rules?limit=100',
    '/v0/rules/detail?source=github.com%2Fteam%2Fcatalog%2Bmore&path=.please%2Fchecks%2Fshell%26tools&id=example',
  ]);
});

// Verifies REQ-0026.
test('uses the local ID and omits the introduction and blocking fact for an unnamed check without a description', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ ...history[0], name: undefined, description: undefined }])));
  const app = open(`/rules/detail?${new URLSearchParams(identity)}`);
  await app.updateComplete;
  const root = app.shadowRoot!.querySelector<RuleView>('pb-rule')!.shadowRoot!;
  await vi.waitFor(() => expect(root.querySelector('h1')?.textContent).toBe(identity.id));
  expect(root.querySelector('.introduction')).toBeNull();
  expect(root.querySelector('select')).toBeNull();
  const facts = root.querySelector('pb-fact-strip')!.shadowRoot!;
  expect([...facts.querySelectorAll('dt')].map(term => term.textContent)).toEqual(['Kind', 'Registered']);
});

// Verifies REQ-0025 and REQ-0026.
test('continues using the last summary and displays each page in ledger order', async () => {
  const fullPage = Array.from({ length: rulePageSize }, (_, index) => ({
    ...summary, id: String(rulePageSize - index), name: `Audit ${String(index).padStart(2, '0')}`,
  }));
  // These names come after Audit, in code point order after lowercasing.
  const secondPage = [{ ...summary, id: 'b', name: 'Zebra' }, { ...summary, id: 'a', name: 'Åudit' }];
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json(fullPage))
    .mockResolvedValueOnce(Response.json(secondPage));
  vi.stubGlobal('fetch', fetch);
  const app = open('/rules');
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<RulesView>('pb-rules')!;
  const table = await tableFrom(view);
  expect([...table.querySelectorAll('tbody a')].map(link => link.textContent))
    .toEqual(fullPage.map(rule => rule.name));

  const link = view.shadowRoot!.querySelector<HTMLAnchorElement>('a')!;
  expect(link.textContent).toBe('Next page');
  const cursor = new URL(link.href).searchParams.get('before')!;
  expect(JSON.parse(cursor)).toEqual({ ...identity, id: '1', version: summary.version, scan: summary.scan });
  link.click();
  await app.updateComplete;

  const next = app.shadowRoot!.querySelector<RulesView>('pb-rules')!;
  const nextTable = await tableFrom(next);
  expect([...nextTable.querySelectorAll('tbody a')].map(link => link.textContent)).toEqual(['Zebra', 'Åudit']);
  expect([...next.shadowRoot!.querySelectorAll('a')].map(link => link.textContent)).toEqual(['First page']);
  const query = new URL(fetch.mock.calls[1][0], window.location.origin).searchParams;
  expect(query.get('before')).toBe(cursor);
});

// Verifies REQ-0026.
test('shows the existing invalid page error when the ledger rejects the cursor', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'invalid_query' }, { status: 400 })));
  const app = open('/rules?before=invalid');
  await app.updateComplete;
  const view = app.shadowRoot!.querySelector<RulesView>('pb-rules')!;
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector('pb-error-state')?.getAttribute('heading'))
    .toBe('Invalid page'));
  expect(view.shadowRoot?.querySelector('pb-data-table')).toBeNull();
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
