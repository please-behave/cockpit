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

interface Registration extends RuleIdentity {
  version: string;
  name?: string;
  description?: string;
}

export interface RegisteredRule extends Registration {
  kind: 'check' | 'review';
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
  badRequest: 'invalid_identifier' | 'invalid_query' | 'invalid_rule_identity' = 'invalid_identifier',
  notFound: 'attestation_not_found' | 'rule_not_found' = 'attestation_not_found',
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

export interface PageOptions {
  before?: string;
  limit?: number;
}

export function attestationPage(
  { before, limit }: PageOptions,
  signal: AbortSignal,
): Promise<Summary[]> {
  const query = new URLSearchParams();
  if (limit !== undefined) query.set('limit', String(limit));
  if (before !== undefined) query.set('before', before);
  const suffix = query.size > 0 ? `?${query}` : '';
  return read(`/v0/attestations${suffix}`, signal, 'invalid_query');
}

export async function getAttestation(id: string, signal: AbortSignal): Promise<Attestation> {
  // These segments resolve to a different endpoint instead of reaching the identifier handler.
  if (['', '.', '..', 'latest'].includes(id)) throw new ApiError('invalid_identifier');

  return read(`/v0/attestations/${encodeURIComponent(id)}`, signal);
}

export const rulePageSize = 100;

export function registeredRules(before: string | null, signal: AbortSignal): Promise<RegisteredRule[]> {
  const query = new URLSearchParams({ limit: String(rulePageSize) });
  if (before !== null) query.set('before', before);
  return read(`/v0/rules?${query}`, signal, 'invalid_query');
}

export function registeredVersions(identity: URLSearchParams, signal: AbortSignal): Promise<RegisteredVersion[]> {
  return read(`/v0/rules/detail?${identity}`, signal, 'invalid_rule_identity', 'rule_not_found');
}
