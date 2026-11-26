import { afterEach, expect, test, vi } from 'vitest';
import type { RegisteredRuleSet, RegisteredRuleSetVersion, RuleSetCompliance } from '../api/client';
import { CockpitApp } from '../components/app';
import { rulePath, ruleSetPath } from './router';

const identity = { source: 'github.com/team/catalog+more', path: 'sets/shell&tools', id: 'shell' };
const member = { ...identity, id: 'syntax', path: 'checks/shell', version: '1.3', digest: 'member', enabled: true };
const markup = '<img src=x onerror=alert(1)>';
const query = new URLSearchParams(identity);
const versions: RegisteredRuleSetVersion[] = [
  {
    ...identity, version: '1.2', description: 'Original set', commit: 'a', digest: 'old', members: [],
    registered_at: '2026-11-20T09:00:00Z', knowledge: { purpose: 'Original purpose', rules: 'future form', unknown: markup },
  },
  {
    ...identity, version: '1.10', name: markup, description: `Description ${markup}`, commit: 'b', digest: 'new',
    registered_at: '2026-11-22T09:00:00Z', members: [member],
    knowledge: {
      purpose: `Purpose ${markup}`, audience: 'Build repositories', commonality: 'Shell checks',
      rules: [null, { rule: member.id, role: `Role ${markup}` }], admission: [false, 'Protect the build'],
      execution_points: 'Run in CI',
    },
  },
];
const compliance: RuleSetCompliance[] = [
  { repository: 'github.com/team/passing', version: '1.10', registered: true, complete: true, non_passing_members: [] },
  {
    repository: `github.com/team/failing-${markup}`, version: '1.2', registered: true, complete: false,
    non_passing_members: [{ ...member, version: '1.1', status: 'WARN' }],
  },
  { repository: 'github.com/team/unknown', version: '2.0', registered: false, complete: false, non_passing_members: [] },
];

function open(path: string) {
  const summary: RegisteredRuleSet = {
    ...identity, version: '1.10', name: markup, member_count: 1, scan: { through: 10, registrations: 2 },
  };
  const fetch = vi.fn(async (url: string) => {
    if (url === `/v0/rule-sets/detail?${query}`) return Response.json(versions);
    if (url === `/v0/rule-sets/compliance?${query}`) return Response.json(compliance);
    if (url === '/v0/rule-sets?limit=100') return Response.json([summary]);
    if (url === '/v0/rules?limit=100') return Response.json([]);
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal('fetch', fetch);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  window.history.replaceState(null, '', path);
  const app = new CockpitApp();
  document.body.append(app);
  return { app, fetch };
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function detail(app: CockpitApp) {
  await vi.waitFor(() => expect(app.shadowRoot?.querySelector('pb-rule-set')?.shadowRoot?.querySelector('article')).toBeTruthy());
  return app.shadowRoot!.querySelector('pb-rule-set')!.shadowRoot!;
}

// Verifies REQ-0004, REQ-0015, REQ-0025 and REQ-0029.
test('opens a Rule Set from Rules, escapes registered text, and shows exact member and compliance versions', async () => {
  const { app, fetch } = open('/rules');
  const link = () => app.shadowRoot?.querySelector('pb-rules')?.shadowRoot?.querySelector<HTMLAnchorElement>('summary a');
  await vi.waitFor(() => expect(link()?.textContent).toBe(markup));
  expect(link()!.getAttribute('href')).toBe(ruleSetPath(identity));
  link()!.click();
  const view = await detail(app);
  expect(app.shadowRoot!.querySelector('pb-app-shell')!.shadowRoot!
    .querySelector('pb-nav-tab[href="/rules"]')!.shadowRoot!.querySelector('a')!.getAttribute('aria-current')).toBe('page');
  expect(view.querySelector('h1')?.textContent).toBe(markup);
  expect(view.querySelector('img')).toBeNull();
  for (const content of [
    `Description ${markup}`, `Purpose ${markup}`, `Role ${markup}`,
    'Build repositories', 'Shell checks', 'Protect the build', 'Run in CI', 'Version is unregistered.',
  ]) expect(view.textContent).toContain(content);
  expect(view.querySelector('article a')!.getAttribute('href')).toBe(rulePath(member, '1.3'));
  const failing = view.querySelector('.non-passing')!;
  expect(failing.querySelector('a')!.getAttribute('href')).toBe(rulePath(member, '1.1'));
  expect(failing.querySelector('pb-status-pill')!.shadowRoot?.textContent).toContain('WARN');
  const binding = failing.closest('pb-widget')!;
  expect(binding.shadowRoot?.querySelector('h3')?.textContent).toBe(`github.com/team/failing-${markup}`);
  expect(binding.textContent).toContain('Version 1.2');
  expect(binding.textContent).toContain('Incomplete');
  expect(view.querySelector('.repositories li')!.textContent).toContain('Complete');

  const select = view.querySelector('select')!;
  expect([...select.options].map(option => option.value)).toEqual(['1.10', '1.2']);
  expect(select.value).toBe('1.10');
  expect(select.options[0].textContent).toContain('Latest');
  const length = window.history.length;
  const requests = fetch.mock.calls.length;
  select.value = '1.2';
  select.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(view.querySelector('h1')?.textContent).toBe(identity.id));
  expect(window.location.search).toBe(`?${query}&version=1.2`);
  expect(window.history.length).toBe(length);
  expect(fetch).toHaveBeenCalledTimes(requests);
  expect(view.textContent).toContain('Original set');
  expect(view.textContent).toContain('Original purpose');
  expect(view.textContent).not.toContain('Admission criteria');
  expect(view.textContent).not.toContain(`Purpose ${markup}`);
  expect(view.querySelector('.non-passing a')!.getAttribute('href')).toBe(rulePath(member, '1.1'));
});

// Verifies REQ-0029.
test('supports historical deep links and falls back from an unavailable version', async () => {
  const { app } = open(ruleSetPath(identity, '1.2'));
  const historical = await detail(app);
  expect(historical.querySelector('select')!.value).toBe('1.2');
  expect(historical.textContent).toContain('Original purpose');

  app.remove();
  const { app: fallback } = open(ruleSetPath(identity, '9.0'));
  const latest = await detail(fallback);
  expect(latest.querySelector('select')!.value).toBe('1.10');
  expect(latest.textContent).toContain('Version 9.0 is unavailable.');
});

// Verifies REQ-0025.
test('shows a missing set without querying current bindings', async () => {
  const { app, fetch } = open(ruleSetPath({ ...identity, id: 'missing' }));
  const error = () => app.shadowRoot?.querySelector('pb-rule-set')?.shadowRoot?.querySelector('pb-error-state');
  await vi.waitFor(() => expect(error()?.getAttribute('heading')).toBe('Registered Rule Set not found'));
  expect(fetch).toHaveBeenCalledTimes(1);
});
