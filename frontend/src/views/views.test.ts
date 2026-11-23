import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, getAttestation, type Summary } from '../api/client';
import type { CommitLink } from '../components/pb-commit-link';
import type { DataTable } from '../components/pb-data-table';
import type { DefinitionList } from '../components/pb-definition-list';
import type { ErrorState } from '../components/pb-error-state';
import type { CockpitTime } from '../components/pb-time';
import type { StatusPill } from '../components/pb-status-pill';
import type { Tooltip } from '../components/pb-tooltip';
import { DetailView } from './detail';
import { DashboardView } from './dashboard';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  getAttestation: vi.fn(),
}));

const detail = vi.mocked(getAttestation);
const receipt = '2026-11-22T11:18:19Z';

const summary = (id: string, overall: Summary['overall'], repository: string,
  execution_points = ['check']): Summary => ({
  id,
  overall,
  repository,
  execution_points,
  received_at: receipt,
  sender: '<img src=x onerror=alert(1)>',
  commit: '0123456789abcdef',
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

// Verifies REQ-0004, REQ-0010, REQ-0017, REQ-0018, REQ-0024 and REQ-0027.
test.each(['light', 'dark'])('detail presents reported results and verification in the %s theme', async theme => {
  document.documentElement.setAttribute('data-theme', theme);
  const repository = 'org/<img src=x>';
  const value = summary('id', 'FAIL', repository, ['check', 'release']);
  const rule = {
    source: 'github.com/org/<img src=x onerror=alert(1)>',
    path: '.please/reviews/<script>bad</script>',
    id: 'review',
  };
  const registeredName = '<img src=x onerror=alert(1)> <script>bad</script>';
  detail.mockResolvedValue({
    ...value,
    results: [
      { id: 'z/review', name: registeredName, kind: 'review', status: 'FAIL',
        rule: { ...rule, version: '1.2' }, verification: { status: 'verified' } },
      { id: 'a/rule', kind: 'integrity', status: 'NOT_RUN',
        verification: { status: 'unverified', reason: 'unregistered' } },
      { id: 'a/rule', name: 'Earlier review', kind: 'check', status: 'PASS',
        rule: { ...rule, version: '2.0' }, verification: { status: 'unverified', reason: 'mismatch' } },
      { id: 'unknown-version', kind: 'review', status: 'WARN',
        rule: { ...rule, version: '3.0' }, verification: { status: 'unverified', reason: 'unregistered' } },
      { id: 'old/review', kind: 'review', status: 'PASS',
        rule: { ...rule, version: '1.0' }, verification: { status: 'verified' } },
    ],
  });
  const view = mountDetail(value.id);
  const root = view.shadowRoot!;
  await vi.waitFor(() => expect(root.activeElement?.textContent).toBe(repository));
  expect(detail).toHaveBeenCalledWith(value.id, expect.any(AbortSignal));
  expect(document.title).toBe(`${repository} | Please Behave`);
  expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  expect(root.textContent).not.toContain('shown as reported');
  expect(root.textContent).not.toContain('Verification shows whether');
  expect(root.querySelector('img, script')).toBeNull();

  const definitions = root.querySelector<DefinitionList>('pb-definition-list')!;
  await definitions.updateComplete;
  const metadata = definitions.shadowRoot!;
  expect([...metadata.querySelectorAll('dt')].map(term => term.textContent))
    .toEqual(['Attestation ID', 'Commit', 'Overall', 'Reported']);
  expect(metadata.querySelector('dd')?.textContent).toBe(value.id);
  const commit = metadata.querySelector<CommitLink>('pb-commit-link')!;
  await commit.updateComplete;
  expect(commit.shadowRoot!.querySelector('code')?.textContent).toBe(value.commit);
  expect(commit.shadowRoot!.querySelector('a')).toBeNull();
  expect(metadata.querySelector<StatusPill>('pb-status-pill')?.status).toBe('FAIL');
  expect(metadata.querySelector<CockpitTime>('pb-time')?.value).toBe(receipt);
  expect(metadata.querySelector('img, script')).toBeNull();

  const table = await tableRoot(view);
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  expect([...table.querySelectorAll('thead th.content')].map(cell => cell.textContent))
    .toEqual(['Kind', 'Status', 'Verification']);
  expect(rows.map(row => [...row.querySelectorAll('td.content')])).toEqual(
    rows.map(row => [...row.cells].slice(1)),
  );
  expect(rows.map(row => row.cells[1].textContent)).toEqual(['review', 'integrity', 'check', 'review', 'review']);
  expect(rows.map(row => row.cells[2].querySelector<StatusPill>('pb-status-pill')?.status)).toEqual([
    'FAIL', 'NOT_RUN', 'PASS', 'WARN', 'PASS',
  ]);
  expect(rows.map(row => row.cells[0].textContent!.trim().replace(/\s*\n\s*/g, ' ')))
    .toEqual([`${registeredName} 1.2`, 'a/rule', 'Earlier review 2.0', 'review', 'review 1.0']);
  expect(rows.map(row => row.cells[0].querySelector('a')?.textContent))
    .toEqual([registeredName, undefined, 'Earlier review', undefined, 'review']);
  expect(rows.map(row => row.cells[0].querySelector('a + [part="rule-version"]')?.textContent))
    .toEqual(['1.2', undefined, '2.0', undefined, '1.0']);
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
  const tooltips = rows.map(row => row.cells[3].querySelector<Tooltip>('pb-tooltip'));
  await Promise.all(tooltips.map(tooltip => tooltip?.updateComplete));
  expect(tooltips.map(tooltip => tooltip?.description)).toEqual([
    undefined,
    'No rule is registered for this identity and version, so the ledger could not check the result.',
    'The reported rule differs from its registered version: the digest does not match.',
    'No rule is registered for this identity and version, so the ledger could not check the result.',
    undefined,
  ]);
  for (const tooltip of tooltips) {
    if (!tooltip) continue;
    const trigger = tooltip.shadowRoot!.querySelector('button')!;
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.classList.contains('hint')).toBe(true);
    expect(tooltip.shadowRoot!.getElementById(trigger.getAttribute('aria-describedby')!)?.textContent?.trim())
      .toBe(tooltip.description);
  }
});

test('detail links the full commit using the shared GitHub target', async () => {
  const value = summary('id', 'PASS', 'github.com/acme/widget');
  detail.mockResolvedValue({ ...value, results: [] });
  const view = mountDetail(value.id);
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-definition-list')).not.toBeNull());
  const definitions = view.shadowRoot!.querySelector<DefinitionList>('pb-definition-list')!;
  await definitions.updateComplete;
  const commit = definitions.shadowRoot!.querySelector<CommitLink>('pb-commit-link')!;
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
