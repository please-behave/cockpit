// Browser Read v0: why/contracts/browser/{latest,list,attestation}.schema.json.
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
    kind: 'check' | 'review' | 'integrity';
    status: Overall | 'NOT_RUN' | 'WARN';
  }[];
}

const errorCodes = {
  401: 'unauthorized',
  404: 'attestation_not_found',
  503: 'ledger_unavailable',
} as const;

type ApiErrorCode = typeof errorCodes[keyof typeof errorCodes]
  | 'invalid_identifier'
  | 'invalid_query'
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
  badRequest: 'invalid_identifier' | 'invalid_query' = 'invalid_identifier',
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
      const code = response.status === 400
        ? badRequest
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
