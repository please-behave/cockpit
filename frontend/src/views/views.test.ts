import { afterEach, expect, test, vi } from 'vitest';
import { ApiError, getAttestation, latestAttestations, type Summary } from '../api/client';
import type { DataTable } from '../components/pb-data-table';
import type { DefinitionList } from '../components/pb-definition-list';
import type { ErrorState } from '../components/pb-error-state';
import type { CockpitTime } from '../components/pb-time';
import type { StatusPill } from '../components/pb-status-pill';
import { DetailView } from './detail';
import { OverviewView } from './overview';

vi.mock(import('../api/client'), async original => ({
  ...await original(),
  getAttestation: vi.fn(),
  latestAttestations: vi.fn(),
}));

const latest = vi.mocked(latestAttestations);
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
});

afterEach(() => {
  document.body.replaceChildren();
  vi.resetAllMocks();
});

async function tableRoot(view: OverviewView | DetailView) {
  const table = view.shadowRoot!.querySelector<DataTable>('pb-data-table')!;
  await table.updateComplete;
  return table.shadowRoot!;
}

function mountDetail(id: string) {
  const view = new DetailView();
  view.attestationId = id;
  document.body.append(view);
  return view;
}

// Verifies REQ-0007 and REQ-0009.
test('overview has a loading state, then an explicit empty state without a table', async () => {
  let complete!: (summaries: Summary[]) => void;
  const pending = new Promise<Summary[]>(resolve => { complete = resolve; });
  latest.mockReturnValue(pending);
  const view = new OverviewView();
  document.body.append(view);
  await view.updateComplete;
  const root = view.shadowRoot!;
  expect(root.querySelector('[role=status]')?.textContent).toBe('Loading…');
  expect(root.activeElement).toBe(root.querySelector('h1'));
  expect(document.title).toBe('Latest attestations | Please Behave');

  complete([]);
  await pending;
  await view.updateComplete;
  const empty = root.querySelector('pb-empty-state')!;
  expect(empty.getAttribute('message')).toBe('No attestations have been reported yet.');
  expect(root.querySelector('[role=status], pb-data-table')).toBeNull();
});

test('overview orders rows, escapes reported values, and reuses rows and links on load', async () => {
  const hostile = 'a/<script>alert(1)</script>';
  const report = summary('first?query', 'ERROR', hostile, ['deploy']);
  const summaries = [
    summary('pass', 'PASS', 'a/pass'),
    summary('fail', 'FAIL', 'a/fail'),
    summary('last-error', 'ERROR', 'z/error'),
    report,
    summary('earlier', 'ERROR', hostile, ['check']),
    { ...summary('short', 'ERROR', hostile, ['check', 'release']), commit: 'c0' },
  ];
  latest.mockResolvedValue(summaries);
  const view = new OverviewView();
  document.body.append(view);
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector('pb-data-table')).not.toBeNull());
  const table = await tableRoot(view);
  const links = [...table.querySelectorAll<HTMLAnchorElement>('tbody a')];
  expect(links.map(link => link.getAttribute('href'))).toEqual([
    '/attestations/earlier', '/attestations/short', '/attestations/first%3Fquery',
    '/attestations/last-error', '/attestations/fail', '/attestations/pass',
  ]);
  expect(links[2].textContent).toBe(hostile);
  expect(table.querySelector('script, img')).toBeNull();
  const row = links[2].closest('tr')!;
  expect([...row.cells].map(cell => cell.textContent)).toEqual([
    hostile, 'deploy', report.sender, '0123456', '', '2', '3', '',
  ]);
  expect(links[1].closest('tr')?.querySelector('code')?.textContent).toBe('c0');
  expect(row.querySelector<CockpitTime>('pb-time')?.value).toBe(receipt);
  expect(row.querySelector<StatusPill>('pb-status-pill')?.status).toBe('ERROR');
  expect(view.shadowRoot!.textContent).toContain('shown as reported');
  expect(summaries[0].id).toBe('pass');

  links[2].focus();
  latest.mockResolvedValue(summaries.map(value => ({ ...value, warn_count: 4 })));
  await view.load();
  await view.updateComplete;
  await tableRoot(view);
  expect(links[2].closest('tr')).toBe(row);
  expect(table.activeElement).toBe(links[2]);
  expect(row.cells[5].textContent).toBe('4');
});

// Verifies REQ-0003.
test('overview shows a ledger error without upstream details and retries', async () => {
  latest.mockRejectedValueOnce(new ApiError('ledger_unavailable')).mockResolvedValueOnce([]);
  const view = new OverviewView();
  document.body.append(view);
  await vi.waitFor(() => expect(view.shadowRoot?.querySelector('pb-error-state')).not.toBeNull());
  const error = view.shadowRoot!.querySelector<ErrorState>('pb-error-state')!;
  await error.updateComplete;
  expect(error.heading).toBe('Ledger unavailable');
  expect(error.message).toBe('Cockpit could not load data from the ledger.');

  error.shadowRoot!.querySelector('button')!.click();
  await vi.waitFor(() => expect(view.shadowRoot!.querySelector('pb-empty-state')).not.toBeNull());
  expect(latest).toHaveBeenCalledTimes(2);
  expect(view.shadowRoot!.activeElement).toBe(view.shadowRoot!.querySelector('h1'));
});

// Verifies REQ-0004 and REQ-0010.
test('detail presents evidence as reported and preserves rule order', async () => {
  const repository = 'org/<img src=x>';
  const value = summary('id', 'FAIL', repository, ['check', 'release']);
  detail.mockResolvedValue({
    ...value,
    results: [
      { id: 'z/<script>bad</script>', kind: 'review', status: 'WARN' },
      { id: 'a/rule', kind: 'integrity', status: 'NOT_RUN' },
      { id: 'a/rule', kind: 'check', status: 'FAIL' },
    ],
  });
  const view = mountDetail(value.id);
  await vi.waitFor(() => expect(document.title).toBe(`${repository} | Please Behave`));
  const root = view.shadowRoot!;
  expect(detail).toHaveBeenCalledWith(value.id, expect.any(AbortSignal));
  expect(root.activeElement?.textContent).toBe(repository);
  expect(document.title).toBe(`${repository} | Please Behave`);
  expect(root.querySelector('a')?.getAttribute('href')).toBe('/');
  expect(root.textContent).toContain('shown as reported');
  expect(root.querySelector('img, script')).toBeNull();

  const definitions = root.querySelector<DefinitionList>('pb-definition-list')!;
  await definitions.updateComplete;
  const metadata = definitions.shadowRoot!;
  expect([...metadata.querySelectorAll('dt')].map(term => term.textContent))
    .toEqual(['Commit', 'Execution points', 'Sender', 'Overall', 'Reported']);
  expect([...metadata.querySelectorAll('dd')].slice(0, 3).map(item => item.textContent))
    .toEqual([value.commit, 'check, release', value.sender]);
  expect(metadata.querySelector<StatusPill>('pb-status-pill')?.status).toBe('FAIL');
  expect(metadata.querySelector<CockpitTime>('pb-time')?.value).toBe(receipt);
  expect(metadata.querySelector('img, script')).toBeNull();

  const table = await tableRoot(view);
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  expect(rows.map(row => row.cells[0].textContent)).toEqual([
    'z/<script>bad</script>', 'a/rule', 'a/rule',
  ]);
  expect(rows.map(row => row.cells[1].textContent)).toEqual(['review', 'integrity', 'check']);
  expect(rows.map(row => row.querySelector<StatusPill>('pb-status-pill')?.status)).toEqual([
    'WARN', 'NOT_RUN', 'FAIL',
  ]);
  expect(table.querySelector('script')).toBeNull();
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
