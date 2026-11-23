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
  { ...identity, version: '1.2', kind: 'check', description: 'First version',
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
test('opens a registered rule and shows its complete history newest first with escaped text', async () => {
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
  await vi.waitFor(() => expect(root.querySelectorAll('article')).toHaveLength(2));
  expect(root.querySelector('h1')?.textContent).toBe(markup);
  expect(root.querySelector('h1')?.classList.contains('assistive')).toBe(false);
  expect([...root.querySelectorAll('h2')].map(heading => heading.textContent)).toEqual(['Version 1.10', 'Version 1.2']);
  const panels = [...root.querySelectorAll('pb-panel')];
  expect(panels.map(panel => panel.hasAttribute('accent'))).toEqual([true, false]);
  expect(panels.map(panel => [...panel.querySelectorAll('pb-badge')].map(badge => badge.textContent)))
    .toEqual([['Latest', 'review', 'Non-blocking'], ['check']]);
  const [latest, first] = [...root.querySelectorAll('article')].map(article =>
    Object.fromEntries([...article.querySelectorAll('dt')].map(term =>
      [term.textContent, term.nextElementSibling?.textContent?.trim()])));
  expect(latest).toMatchObject({
    Description: markup, Prompt: prompt, Blocking: 'Non-blocking', Purpose: 'Review the build',
    Problem: 'Unstable builds', Value: 'Predictable runs', Conditions: expect.stringContaining(markup),
    'Success criteria': 'Detect broken builds', 'Out of scope': expect.stringContaining('Rule deploy'),
    Limitations: 'Static inspection', Placement: 'Shared catalog', References: markup,
  });
  expect(first).toMatchObject({ Description: 'First version', Purpose: 'Check the build', Conditions: 'Use locked tools' });
  expect(first).not.toHaveProperty('References');
  expect(first).not.toHaveProperty('Prompt');
  expect(first).not.toHaveProperty('Blocking');
  expect(latest).not.toHaveProperty('future');
  expect(root.querySelector('article pb-time')?.shadowRoot?.querySelector('time')?.dateTime)
    .toBe('2026-11-22T09:00:00Z');
  expect(root.querySelector('img, [onerror]')).toBeNull();
  expect(fetch.mock.calls.map(([path]) => path)).toEqual([
    '/v0/rules?limit=100',
    '/v0/rules/detail?source=github.com%2Fteam%2Fcatalog%2Bmore&path=.please%2Fchecks%2Fshell%26tools&id=example',
  ]);
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

// Verifies REQ-0027.
test('deep links to the selected version without changing the order or ledger query', async () => {
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
    expect(root.querySelector('h2')?.textContent).toBe('Version 1.10');
    expect(fetch.mock.calls[0][0]).not.toContain('version=');
  } finally {
    if (previous) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', previous);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});
