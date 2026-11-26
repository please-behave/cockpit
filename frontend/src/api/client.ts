// Browser Read v0: why/contracts/browser/.
export type Overall = 'PASS' | 'FAIL' | 'ERROR';

export interface Summary {
  id: string;
  received_at: string;
  sender: string;
  repository: string;
  commit: string;
  execution_points: string[];
  overall: Overall;
  warn_count: number;
  not_run_count: number;
  result_count: number;
}

export interface Attestation extends Summary {
  rule_sets?: BoundRuleSet[];
  results: {
    id: string;
    name?: string;
    kind: 'check' | 'review' | 'integrity';
    status: Overall | 'NOT_RUN' | 'WARN';
    verification: Verification;
    rule?: RuleIdentity & { version?: string };
  }[];
}

type Verification =
  | { status: 'verified' }
  | { status: 'unverified'; reason: 'unregistered' | 'mismatch' };

export interface RuleIdentity {
  source: string;
  path: string;
  id: string;
}

export interface BoundRuleSet extends RuleIdentity {
  version: string;
  execution_points: string[];
}

export interface RuleSetRegistration extends RuleIdentity {
  version: string;
  name: string;
}

export type CompletedRuleSet = RuleSetRegistration;

export interface RepositoryRuleSets {
  repository: string;
  sets: CompletedRuleSet[];
}

export interface ReleaseSummary {
  repository: string;
  version: string;
  commit: string;
  received_at: string;
  sender: string;
  auth_method: 'api_key' | 'github_oidc';
  evidence: { overall: Overall; completed_rule_sets: CompletedRuleSet[] } | null;
}

export interface DeploymentTarget {
  owner: string;
  name: string;
}

export type Deployment = Pick<ReleaseSummary, 'repository' | 'sender' | 'auth_method' | 'received_at'> & {
  id: string;
  target: DeploymentTarget;
} & (
  | ({ version: string; reported_commit: null } | { version: null; reported_commit: string }) & (
    | { state: 'evidence'; commit: string; evidence: NonNullable<ReleaseSummary['evidence']> }
    | { state: 'no_evidence'; commit: string; evidence: null }
  )
  | { state: 'release_not_recorded'; version: string; reported_commit: null; commit: null; evidence: null }
);

export type AuthMethod = ReleaseSummary['auth_method'];

export interface ReleaseEvidenceRuleSet extends CompletedRuleSet {
  registered: boolean;
  complete: boolean;
  non_passing_members: RuleSetCompliance['non_passing_members'];
}

export interface ReleaseDetail extends Omit<ReleaseSummary, 'evidence'> {
  evidence: {
    id: string;
    overall: Overall;
    received_at: string;
    sender: string;
    auth_method: AuthMethod | null;
    rule_sets: ReleaseEvidenceRuleSet[];
  } | null;
}

interface Registration extends RuleIdentity {
  version: string;
  name?: string;
  description?: string;
  owner?: string;
  rule_sets?: RuleSetRegistration[];
}

export interface RegistryCursor extends RuleIdentity {
  version: string;
  scan: { through: number; registrations: number };
}

export interface RegisteredRule extends Registration, RegistryCursor {
  kind: 'check' | 'review';
}

export interface RegisteredRuleSet extends RuleSetRegistration, RegistryCursor {
  description?: string;
  member_count: number;
}

export interface RegisteredRuleSetVersion extends RuleIdentity {
  version: string;
  name?: string;
  description?: string;
  knowledge?: Record<string, unknown>;
  members: (RuleIdentity & { version: string; digest: string; enabled: boolean })[];
  digest: string;
  commit: string;
  registered_at: string;
}

export interface RuleSetCompliance {
  repository: string;
  version: string;
  registered: boolean;
  complete: boolean;
  non_passing_members: (RuleIdentity & { version: string; status: Exclude<Attestation['results'][number]['status'], 'PASS'> })[];
}

export type RegisteredVersion = Registration & {
  knowledge?: Record<string, unknown>;
  digest: string;
  commit: string;
  registered_at: string;
} & ({ kind: 'check' } | { kind: 'review'; blocking: boolean; prompt: string });

const errorCodes = {
  401: 'unauthorized',
  503: 'ledger_unavailable',
} as const;

type ApiErrorCode = typeof errorCodes[keyof typeof errorCodes]
  | 'attestation_not_found'
  | 'rule_not_found'
  | 'rule_set_not_found'
  | 'release_not_found'
  | 'invalid_release'
  | 'invalid_rule_set_identity'
  | 'invalid_identifier'
  | 'invalid_query'
  | 'invalid_rule_identity'
  | 'timeout'
  | 'request_failed';

export class ApiError extends Error {
  constructor(readonly code: ApiErrorCode) {
    super(code);
    this.name = 'ApiError';
  }
}

// Leave time for the cockpit's five-second ledger request to report its own outcome.
const requestTimeout = 10_000;

async function read<T>(
  path: string,
  signal: AbortSignal,
  badRequest: 'invalid_identifier' | 'invalid_query' | 'invalid_release' | 'invalid_rule_identity' | 'invalid_rule_set_identity' = 'invalid_identifier',
  notFound: 'attestation_not_found' | 'release_not_found' | 'rule_not_found' | 'rule_set_not_found' = 'attestation_not_found',
): Promise<T> {
  const deadline = new AbortController();
  const timeout = window.setTimeout(() => deadline.abort(), requestTimeout);
  try {
    signal.throwIfAborted();
    const response = await fetch(path, {
      credentials: 'same-origin',
      mode: 'same-origin',
      redirect: 'error',
      signal: AbortSignal.any([signal, deadline.signal]),
    });
    signal.throwIfAborted();
    if (response.status === 401) window.location.assign('/sign-in');

    if (!response.ok) {
      const code = response.status === 400 ? badRequest
        : response.status === 404 ? notFound
        : errorCodes[response.status as keyof typeof errorCodes];
      throw new ApiError(code ?? 'request_failed');
    }
    return await response.json() as T;
  } catch (error) {
    signal.throwIfAborted();
    if (deadline.signal.aborted) throw new ApiError('timeout');
    if (error instanceof ApiError) throw error;
    throw new ApiError('request_failed');
  } finally {
    window.clearTimeout(timeout);
  }
}

export function latestAttestations(signal: AbortSignal): Promise<Summary[]> {
  return read('/v0/attestations/latest', signal);
}

export function completedRuleSets(signal: AbortSignal): Promise<RepositoryRuleSets[]> {
  return read('/v0/repositories/completed-rule-sets', signal);
}

export interface PageOptions {
  before?: string;
  limit?: number;
  repository?: string;
}

export function attestationPage(
  { before, limit, repository }: PageOptions,
  signal: AbortSignal,
): Promise<Summary[]> {
  const query = new URLSearchParams();
  if (limit !== undefined) query.set('limit', String(limit));
  if (before !== undefined) query.set('before', before);
  if (repository !== undefined) query.set('repository', repository);
  const suffix = query.size > 0 ? `?${query}` : '';
  return read(`/v0/attestations${suffix}`, signal, 'invalid_query');
}

const releasePageSize = 100;

export async function releases(repository: string | null, signal: AbortSignal): Promise<ReleaseSummary[]> {
  const path = repository === null ? '/v0/releases/latest' : '/v0/releases';
  const query = new URLSearchParams({ limit: String(releasePageSize) });
  if (repository !== null) query.set('repository', repository);

  const entries = new Map<string, ReleaseSummary>();
  const cursors = new Set<string>();
  for (;;) {
    const page = await read<ReleaseSummary[]>(`${path}?${query}`, signal, 'invalid_query');
    for (const entry of page) {
      // A release can become the newest for a repository while pages are in flight.
      const key = repository === null ? entry.repository : entry.version;
      if (!entries.has(key)) entries.set(key, entry);
    }
    if (page.length < releasePageSize) return [...entries.values()];

    const last = page[page.length - 1];
    const cursor = JSON.stringify({ repository: last.repository, version: last.version });
    if (cursors.has(cursor)) throw new ApiError('ledger_unavailable');
    cursors.add(cursor);
    query.set('before', cursor);
  }
}

export async function deployments(signal: AbortSignal, repository?: string): Promise<Deployment[]> {
  const pageSize = 100;
  const query = new URLSearchParams({ limit: String(pageSize) });
  if (repository !== undefined) query.set('repository', repository);
  const entries = new Map<string, Deployment>();
  const cursors = new Set<string>();
  for (;;) {
    const page = await read<Deployment[]>(`/v0/deployments?${query}`, signal, 'invalid_query');
    for (const entry of page) {
      // Each page reflects the ledger's current events at the time it is read.
      const key = JSON.stringify([entry.target.owner, entry.target.name, entry.repository]);
      if (!entries.has(key)) entries.set(key, entry);
    }
    if (page.length < pageSize) return [...entries.values()];

    const cursor = page[page.length - 1].id;
    if (cursors.has(cursor)) throw new ApiError('ledger_unavailable');
    cursors.add(cursor);
    query.set('before', cursor);
  }
}

export function getRelease(repository: string, version: string, signal: AbortSignal): Promise<ReleaseDetail> {
  const query = new URLSearchParams({ repository, version });
  return read(`/v0/releases/detail?${query}`, signal, 'invalid_release', 'release_not_found');
}

export async function getAttestation(id: string, signal: AbortSignal): Promise<Attestation> {
  // These segments resolve to a different endpoint instead of reaching the identifier handler.
  if (['', '.', '..', 'latest'].includes(id)) throw new ApiError('invalid_identifier');

  return read(`/v0/attestations/${encodeURIComponent(id)}`, signal);
}

export const rulePageSize = 100;

export function registeredRules(before: string | null, signal: AbortSignal): Promise<RegisteredRule[]> {
  return registryPage('/v0/rules', before, signal);
}

export function registeredRuleSets(before: string | null, signal: AbortSignal): Promise<RegisteredRuleSet[]> {
  return registryPage('/v0/rule-sets', before, signal);
}

function registryPage<T>(path: string, before: string | null, signal: AbortSignal): Promise<T[]> {
  const query = new URLSearchParams({ limit: String(rulePageSize) });
  if (before !== null) query.set('before', before);
  return read(`${path}?${query}`, signal, 'invalid_query');
}

export function ruleSetCompliance({ source, path, id }: RuleIdentity, signal: AbortSignal): Promise<RuleSetCompliance[]> {
  return read(`/v0/rule-sets/compliance?${new URLSearchParams({ source, path, id })}`, signal, 'invalid_query');
}

export function registeredRuleSetVersions(identity: URLSearchParams, signal: AbortSignal): Promise<RegisteredRuleSetVersion[]> {
  return read(`/v0/rule-sets/detail?${identity}`, signal, 'invalid_rule_set_identity', 'rule_set_not_found');
}

export function registeredVersions(identity: URLSearchParams, signal: AbortSignal): Promise<RegisteredVersion[]> {
  return read(`/v0/rules/detail?${identity}`, signal, 'invalid_rule_identity', 'rule_not_found');
}
