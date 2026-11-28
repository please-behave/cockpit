import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, getAttestation, registeredRuleSetVersions, type Attestation, type Summary } from '../api/client';
import type { CommitLink } from '../components/pb-commit-link';
import type { DataTable } from '../components/pb-data-table';
import type { ErrorState } from '../components/pb-error-state';
import type { FactStrip } from '../components/pb-fact-strip';
import type { CockpitTime } from '../components/pb-time';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { DetailView } from './detail';
import { DashboardView } from './dashboard';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  getAttestation: vi.fn(),
  registeredRuleSetVersions: vi.fn(),
}));

const detail = vi.mocked(getAttestation);
const setVersions = vi.mocked(registeredRuleSetVersions);
const receipt = '2026-11-22T11:18:19Z';

const summary = (id: string, overall: Summary['overall'], repository: string,
  execution_points = ['check']): Summary => ({
  id,
  overall,
  repository,
  execution_points,
  received_at: receipt,
  sender: '<img src=x onerror=alert(1)>',
  commit: '0123456789abcdef0123456789abcdef01234567',
  warn_count: 2,
  not_run_count: 3,
  result_count: 7,
});

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute('data-theme');
  vi.resetAllMocks();
});

async function tableRoot(view: DetailView) {
  const table = view.shadowRoot!.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  return table.shadowRoot!;
}

function mountDetail(id: string, origin?: DetailView['origin']) {
  const view = new DetailView();
  view.attestationId = id;
  view.origin = origin;
  document.body.append(view);
  return view;
}

async function expectExplanation(container: Element, description: string) {
  const tooltip = container.querySelector<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  const trigger = tooltip.shadowRoot!.querySelector('button')!;
  expect(trigger.tabIndex).toBe(0);
  expect(tooltip.shadowRoot!.getElementById(trigger.getAttribute('aria-describedby')!)?.textContent?.trim())
    .toBe(description);
}

async function popupFor(trigger: Element) {
  const tooltip = trigger.closest<Tooltip>('pb-tooltip')!;
  await tooltip.updateComplete;
  return tooltip.shadowRoot!.querySelector<HTMLElement>('[role="tooltip"]')!;
}

// Verifies REQ-0004, REQ-0010, REQ-0016, REQ-0017, REQ-0018, REQ-0024 and REQ-0027.
test.each(['light', 'dark'])('detail presents reported results and verification in the %s theme', async theme => {
  document.documentElement.setAttribute('data-theme', theme);
  const name = '<img src=x>';
  const repository = `org/${name}`;
  const value = summary('00000000-0000-4000-8000-000000000001', 'FAIL', repository, ['check', 'release']);
  const rule = {
    source: 'github.com/org/<img src=x onerror=alert(1)>',
    path: '.please/reviews/<script>bad</script>',
    id: 'review',
  };
  const registeredName = '<img src=x onerror=alert(1)> <script>bad</script>';
  const longDescription = '✅'.repeat(158) + '😀' + 'x'.repeat(20);
  detail.mockResolvedValue({
    ...value,
    results: [
      { id: 'z/review', name: registeredName, description: 'Check <img src=x> output.', kind: 'review', status: 'FAIL',
        rule: { ...rule, version: '1.2' }, verification: { status: 'verified' } },
      { id: 'a/rule', kind: 'integrity', status: 'NOT_RUN',
        verification: { status: 'unverified', reason: 'unregistered' } },
      { id: 'a/rule', name: 'Earlier review', description: longDescription, kind: 'check', status: 'PASS',
        rule: { ...rule, version: '2.0' }, verification: { status: 'unverified', reason: 'mismatch' } },
      { id: 'unknown-version', kind: 'review', status: 'WARN',
        rule: { ...rule, version: '3.0' }, verification: { status: 'unverified', reason: 'unregistered' } },
      { id: 'old/review', kind: 'review', status: 'PASS',
        rule: { ...rule, version: '1.0' }, verification: { status: 'verified' } },
    ],
  });
  const view = mountDetail(value.id);
  const root = view.shadowRoot!;
  await vi.waitFor(() => expect(root.activeElement?.textContent).toBe(name));
  expect(detail).toHaveBeenCalledWith(value.id, expect.any(AbortSignal));
  expect(document.title).toBe(`${name} | Please Behave`);
  expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  expect(root.textContent).not.toContain('shown as reported');
  expect(root.textContent).not.toContain('Verification shows whether');
  expect(root.querySelector('img, script')).toBeNull();

  const strip = root.querySelector<FactStrip>('pb-fact-strip')!;
  await strip.updateComplete;
  const facts = strip.shadowRoot!;
  expect([...facts.querySelectorAll('dt')].map(term => term.textContent))
    .toEqual(['Overall', 'Commit', 'Reported', 'Attestation ID', 'Canonical name']);
  const [overall, commitValue, reported, id, canonicalName] = facts.querySelectorAll('dd');
  expect(id.textContent).toBe(value.id);
  expect(canonicalName.textContent).toBe(repository);
  expect(canonicalName.querySelector('a')?.getAttribute('href'))
    .toBe(`/repositories/detail?${new URLSearchParams({ repository })}`);
  const commit = commitValue.querySelector<CommitLink>('pb-commit-link')!;
  await commit.updateComplete;
  expect(commit.shadowRoot!.querySelector('code')?.textContent).toBe(value.commit);
  expect(commit.shadowRoot!.querySelector('a')).toBeNull();
  const pill = overall.querySelector<StatusPill>('pb-status-pill')!;
  await pill.updateComplete;
  expect(pill.shadowRoot!.querySelector('.pill span:last-child')?.textContent).toBe('FAIL');
  expect(pill.shadowRoot!.querySelector('pb-icon')?.getAttribute('name')).toBe('cross');
  await expectExplanation(overall, 'The run reported a blocking failure, so it did not pass.');
  expect(reported.querySelector<CockpitTime>('pb-time')?.value).toBe(receipt);
  expect(facts.querySelector('img, script')).toBeNull();

  const table = await tableRoot(view);
  expect(table.querySelector('caption:not(.assistive)')?.textContent).toBe('Rules');
  expect(table.querySelector('th[scope="rowgroup"]')?.textContent).toBe('Unassigned');
  expect(setVersions).not.toHaveBeenCalled();
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr + tr')];
  expect([...table.querySelectorAll('thead th.content')].map(cell => cell.textContent))
    .toEqual(['Kind', 'Status', 'Verification']);
  expect(rows.map(row => [...row.querySelectorAll('td.content')])).toEqual(
    rows.map(row => [...row.cells].slice(1)),
  );
  expect(rows.map(row => row.cells[1].querySelector('pb-badge')?.textContent))
    .toEqual(['review', 'integrity', 'check', 'review', 'review']);
  expect(rows.map(row => row.cells[1].querySelector('pb-badge')?.getAttribute('tone')))
    .toEqual(['review', null, 'check', 'review', 'review']);
  expect(rows.map(row => row.cells[2].querySelector<StatusPill>('pb-status-pill')?.status)).toEqual([
    'FAIL', 'NOT_RUN', 'PASS', 'WARN', 'PASS',
  ]);
  expect(rows.map(row => row.cells[0].textContent?.trim()))
    .toEqual([registeredName, 'a/rule', 'Earlier review', 'review', 'review']);
  expect(rows.map(row => row.cells[0].querySelector('a')?.textContent))
    .toEqual([registeredName, undefined, 'Earlier review', undefined, 'review']);
  const triggers = rows.map(row => row.cells[0].querySelector<HTMLElement>('[aria-description]'));
  const popups = await Promise.all(triggers.map(trigger => trigger && popupFor(trigger)));
  expect(popups.map(popup => popup?.textContent?.trim())).toEqual([
    'Version 1.2 · Check <img src=x> output.', undefined,
    `Version 2.0 · ${'✅'.repeat(158)}😀…`, 'Version 3.0', 'Version 1.0',
  ]);
  expect(popups[0]?.querySelector('img')).toBeNull();
  const ruleLink = triggers[0]!;
  const rulePopup = popups[0]!;
  expect(rulePopup.hidden).toBe(true);
  ruleLink.focus();
  expect(rulePopup.hidden).toBe(false);
  expect(ruleLink.matches(':focus-visible')).toBe(true);
  ruleLink.blur();
  expect(rulePopup.hidden).toBe(true);
  expect(rows.map(row => {
    const link = row.cells[0].querySelector('a');
    return link ? Object.fromEntries(new URL(link.href).searchParams) : null;
  })).toEqual([
    { ...rule, version: '1.2' }, null, { ...rule, version: '2.0' }, null, { ...rule, version: '1.0' },
  ]);
  expect(table.querySelector('img, script, [onerror]')).toBeNull();

  const verification = rows.map(row => row.cells[3].querySelector<StatusPill>('pb-status-pill')!);
  await Promise.all(verification.map(pill => pill.updateComplete));
  expect(verification.map(pill => pill.shadowRoot!.querySelector('.pill span:last-child')?.textContent))
    .toEqual(['Verified', 'Unverified', 'Unverified', 'Unverified', 'Verified']);
  expect(verification.map(pill => pill.shadowRoot!.querySelector('.pill')?.className))
    .toEqual(['pill passed', 'pill warning', 'pill warning', 'pill warning', 'pill passed']);
  const descriptions = [
    [
      'An AI reviewer evaluates the supplied evidence against a prompt. Its verdict is probabilistic.',
      'The rule ran and reported that its requirements were not met.',
      'The reported rule identity and version match a ledger registration, and their digests are equal.',
    ],
    [
      'An integrity result reports whether the conditions needed for trustworthy run evidence held.',
      'The rule did not complete, so no verdict is available.',
      'The ledger could not verify the rule. Its identity, version or digest was missing, or no matching version was registered.',
    ],
    [
      'A check runs a command and determines the outcome from its exit status.',
      'The rule ran and reported success.',
      'The ledger could not verify the rule. The identity and version match a registration, but the reported and registered digests differ.',
    ],
    [
      'An AI reviewer evaluates the supplied evidence against a prompt. Its verdict is probabilistic.',
      'The rule reported an advisory problem that did not block overall success.',
      'The ledger could not verify the rule. Its identity, version or digest was missing, or no matching version was registered.',
    ],
    [
      'An AI reviewer evaluates the supplied evidence against a prompt. Its verdict is probabilistic.',
      'The rule ran and reported success.',
      'The reported rule identity and version match a ledger registration, and their digests are equal.',
    ],
  ];
  for (const [index, row] of rows.entries()) {
    await Promise.all(descriptions[index].map((text, column) => expectExplanation(row.cells[column + 1], text)));
  }
});

// Verifies REQ-0010.
test.each([
  ['PASS', 'The run reported overall success. Advisory warnings can still be present.'],
  ['ERROR', 'An error or an incomplete required result prevented the run from passing.'],
] as const)('explains the %s overall outcome separately from rule status', async (overall, description) => {
  const value = summary('00000000-0000-4000-8000-000000000001', overall, 'org/repo');
  detail.mockResolvedValue({
    ...value,
    results: [
      { id: 'evaluation-error', kind: 'check', status: 'ERROR', verification: { status: 'verified' } },
    ],
  });
  const view = mountDetail(value.id);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-data-table')).not.toBeNull());
  const table = await tableRoot(view);
  const strip = view.shadowRoot!.querySelector<FactStrip>('pb-fact-strip')!;
  await strip.updateComplete;
  await expectExplanation(strip.shadowRoot!.querySelector('dd')!, description);
  const row = table.querySelector<HTMLTableRowElement>('tbody tr + tr')!;
  await expectExplanation(row.cells[2], 'A problem prevented the rule from reaching a verdict.');
});

// Verifies REQ-0010 and REQ-0015.
test('groups results by the exact bound versions, preserving both binding and result order', async () => {
  const value = summary('id', 'FAIL', 'github.com/acme/widget');
  const source = 'github.com/team/catalog';
  const binding = { source, version: '1.0', execution_points: ['check'] };
  const first = { ...binding, path: 'sets/first & policy', id: 'first', description: 'First <b>set</b>.' };
  const second = { ...binding, path: 'sets/second', id: 'second', version: '2.0' };
  const missing = { ...binding, path: 'sets/missing', id: 'missing' };
  const longName = 'A long name with an unbroken segment ' + 'LongRuleSetName'.repeat(12);
  const rule = { source, path: 'rules/license', id: 'license', version: '1.0' };
  const sibling = { ...rule, path: 'rules/build' };
  const makeResult = (name: string, rule?: Attestation['results'][number]['rule']): Attestation['results'][number] =>
    ({ id: name, name, rule, kind: 'check', status: 'PASS', verification: { status: 'verified' } });
  const makeSet = (binding: typeof second, name: string, members: (typeof rule)[]) => ({
    ...binding, name, description: 'Registry description', members: members.map(member => ({ ...member, digest: 'digest', enabled: true })),
    digest: 'digest', commit: value.commit, registered_at: receipt,
  });
  detail.mockResolvedValue({
    ...value,
    rule_sets: [second, first, missing],
    results: [
      makeResult('Build', sibling),
      makeResult('License', rule),
      makeResult('Local', { ...rule, source: value.repository }),
      makeResult('Wrong path', { ...rule, path: 'other' }),
      makeResult('Wrong version', { ...rule, version: '3.0' }),
      makeResult('Run identifier'),
    ],
  });
  setVersions.mockImplementation(async query => {
    switch (query.get('id')) {
      case 'first': return [makeSet(first, '<b>First</b>', [rule, sibling]), makeSet({ ...first, version: '2.0' }, 'Latest', [])];
      case 'second': return [makeSet(second, longName, [rule])];
      default: throw new ApiError('rule_set_not_found');
    }
  });

  const view = mountDetail(value.id);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-data-table')).not.toBeNull());
  const table = await tableRoot(view);
  const groups = [...table.querySelectorAll('tbody')];
  const headers = [...table.querySelectorAll('th[scope="rowgroup"]')];
  expect(headers.map(header => header.getAttribute('colspan'))).toEqual(['4', '4', '4', '4', '4']);
  const links = [...table.querySelectorAll<HTMLAnchorElement>('th[scope="rowgroup"] a')];
  expect(table.querySelector('pb-rule-set-chip')).toBeNull();
  expect(links.map(link => link.textContent)).toEqual([`${longName} · 2.0`, '<b>First</b> · 1.0', 'missing · 1.0']);
  expect(links.map(link => link.querySelector('.muted')?.textContent)).toEqual(['· 2.0', '· 1.0', '· 1.0']);
  expect(links[1].querySelector('b')).toBeNull();
  expect(links.map(link => link.getAttribute('aria-description'))).toEqual([null, 'First <b>set</b>.', null]);
  expect(links.map(link => link.closest('pb-tooltip')?.hasAttribute('text-value'))).toEqual([undefined, false, undefined]);
  const setPopup = await popupFor(links[1]);
  expect(setPopup.textContent?.trim()).toBe('First <b>set</b>.');
  expect(setPopup.querySelector('b')).toBeNull();

  const prevented: boolean[] = [];
  const follow = (event: Event) => {
    prevented.push(event.defaultPrevented);
    event.preventDefault();
  };
  document.addEventListener('click', follow);
  try {
    const tap = () => links[1].dispatchEvent(new PointerEvent('click', {
      pointerType: 'touch', bubbles: true, composed: true, cancelable: true,
    }));
    expect(setPopup.hidden).toBe(true);
    tap();
    expect(prevented).toEqual([true]);
    expect(setPopup.hidden).toBe(false);
    tap();
    expect(prevented).toEqual([true, false]);
  } finally {
    document.removeEventListener('click', follow);
  }
  expect(links.map(link => Object.fromEntries(new URL(link.href).searchParams)))
    .toEqual([second, first, missing].map(({ source, path, id, version }) => ({ source, path, id, version })));
  expect(headers.slice(3).map(header => header.textContent)).toEqual(['Local rules', 'Unassigned']);
  expect(groups.map(group => [...group.querySelectorAll('th[scope="row"]')].map(cell =>
    cell.querySelector('a')?.textContent ?? cell.textContent))).toEqual([
    ['License'], ['Build', 'License'], [], ['Local'], ['Wrong path', 'Wrong version', 'Run identifier'],
  ]);
});

test('an empty binding list places even repository rules under Unassigned', async () => {
  const value = summary('id', 'PASS', 'github.com/acme/widget');
  detail.mockResolvedValue({
    ...value, rule_sets: [],
    results: [{
      id: 'check', kind: 'check', status: 'PASS', verification: { status: 'unverified', reason: 'unregistered' },
      rule: { source: value.repository, path: 'checks/local', id: 'local' },
    }],
  });
  const view = mountDetail(value.id);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-data-table')).not.toBeNull());
  const table = await tableRoot(view);
  expect(table.querySelector('th[scope="rowgroup"]')?.textContent).toBe('Unassigned');
  expect(table.querySelector('th[scope="row"]')?.textContent).toBe('local');
  expect(setVersions).not.toHaveBeenCalled();
});

test('detail links the full commit using the shared GitHub target', async () => {
  const value = summary('id', 'PASS', 'github.com/acme/widget');
  detail.mockResolvedValue({ ...value, results: [] });
  const view = mountDetail(value.id);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-fact-strip')).not.toBeNull());
  const strip = view.shadowRoot!.querySelector<FactStrip>('pb-fact-strip')!;
  await strip.updateComplete;
  const commit = strip.shadowRoot!.querySelector<CommitLink>('pb-commit-link')!;
  await commit.updateComplete;
  const link = commit.shadowRoot!.querySelector('a')!;
  expect(link.querySelector('code')?.textContent).toBe(value.commit);
  expect(link.href).toBe(`https://github.com/acme/widget/commit/${value.commit}`);
  expect(link.target).toBe('_blank');
});

test.each([
  ['invalid_identifier', 'Invalid attestation identifier', false],
  ['attestation_not_found', 'Attestation not found', false],
  ['ledger_unavailable', 'Ledger unavailable', true],
] as const)('detail shows %s as its own error state', async (code, heading, retryable) => {
  detail.mockRejectedValue(new ApiError(code));
  const view = mountDetail('id');
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector('pb-error-state')).not.toBeNull());
  const error = view.shadowRoot!.querySelector<ErrorState>('pb-error-state')!;
  expect(error.heading).toBe(heading);
  expect(error.retryable).toBe(retryable);
});

test('detail reports loading and cancels work on disposal', async () => {
  detail.mockReturnValue(new Promise(() => {}));
  const view = mountDetail('id');
  await view.updateComplete;
  expect(view.shadowRoot!.querySelector('[role=status]')?.textContent).toBe('Loading…');
  const signal = detail.mock.calls[0][1];
  expect(signal.aborted).toBe(false);
  view.remove();
  expect(signal.aborted).toBe(true);
});

// Verifies REQ-0010.
test.each([
  [undefined, 'Back to dashboard', '/', true],
  ['dashboard', 'Back to dashboard', '/', false],
  ['history', 'Back to attestations', '/attestations', false],
] as const)('detail opened from %s offers "%s"', async (origin, text, href, routed) => {
  detail.mockReturnValue(new Promise(() => {}));
  const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
  const view = mountDetail('id', origin);
  await view.updateComplete;
  const link = view.shadowRoot!.querySelector('a')!;
  expect(link.textContent?.trim()).toBe(text);
  expect(link.getAttribute('href')).toBe(href);
  expect(link.hasAttribute('data-route')).toBe(routed);

  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(click);
  expect(back).toHaveBeenCalledTimes(routed ? 0 : 1);
  expect(click.defaultPrevented).toBe(!routed);

  const modified = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
  link.dispatchEvent(modified);
  expect(back).toHaveBeenCalledTimes(routed ? 0 : 1);
});
