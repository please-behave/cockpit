import { afterEach, expect, test, vi } from 'vitest';
import { attestationPage, getAttestation, latestAttestations, repositoryOverview } from './client';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('reads the same-origin contracts and encodes the detail segment', async () => {
  const body = { id: 'reported' };
  const overview = { heartbeat: { completed_at: null, stale: true }, repositories: [] };
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json(overview))
    .mockResolvedValueOnce(Response.json([body]))
    .mockResolvedValueOnce(Response.json(body));
  vi.stubGlobal('fetch', fetch);
  const { signal } = new AbortController();

  await expect(repositoryOverview(signal)).resolves.toEqual(overview);
  await expect(latestAttestations(signal)).resolves.toEqual([body]);
  await expect(getAttestation('a/b?#', signal)).resolves.toEqual(body);
  const options = expect.objectContaining({
    mode: 'same-origin',
    credentials: 'same-origin',
    redirect: 'error',
    signal: expect.any(AbortSignal),
  });
  expect(fetch).toHaveBeenNthCalledWith(1, '/v0/repositories/overview', options);
  expect(fetch).toHaveBeenNthCalledWith(2, '/v0/attestations/latest', options);
  expect(fetch).toHaveBeenNthCalledWith(3, '/v0/attestations/a%2Fb%3F%23', options);
});

test.each([
  [400, 'invalid_identifier'],
  [404, 'attestation_not_found'],
  [503, 'ledger_unavailable'],
  [500, 'request_failed'],
])('maps HTTP %s to %s without exposing the response body', async (status, code) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream detail', { status })));
  await expect(getAttestation('id', new AbortController().signal)).rejects.toMatchObject({
    name: 'ApiError',
    message: code,
    code,
  });
});

test('redirects to sign-in when the session expires', async () => {
  const assign = vi.fn();
  vi.stubGlobal('window', {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    location: { assign },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

  await expect(latestAttestations(new AbortController().signal)).rejects.toMatchObject({
    code: 'unauthorized',
  });
  expect(assign).toHaveBeenCalledWith('/sign-in');
});

test('rejects identifiers that would resolve to another endpoint', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  for (const id of ['', '.', '..', 'latest']) {
    await expect(getAttestation(id, new AbortController().signal)).rejects.toMatchObject({
      code: 'invalid_identifier',
    });
  }
  expect(fetch).not.toHaveBeenCalled();
});

function blockedFetch() {
  return vi.fn((_path: string, { signal }: { signal: AbortSignal }) =>
    new Promise<Response>((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
}

test('passes cancellation to fetch and leaves no pending timeout', async () => {
  vi.useFakeTimers();
  const fetch = blockedFetch();
  vi.stubGlobal('fetch', fetch);
  const request = new AbortController();
  const result = latestAttestations(request.signal);
  request.abort();

  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test('aborts the request at the deadline and reports a timeout', async () => {
  vi.useFakeTimers();
  const fetch = blockedFetch();
  vi.stubGlobal('fetch', fetch);
  const result = expect(latestAttestations(new AbortController().signal)).rejects.toMatchObject({
    code: 'timeout',
  });
  await vi.advanceTimersByTimeAsync(10_000);
  await result;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

test('reads one page of the list with the given query', async () => {
  const fetch = vi.fn().mockImplementation(async () => Response.json([]));
  vi.stubGlobal('fetch', fetch);
  const { signal } = new AbortController();

  await expect(attestationPage({}, signal)).resolves.toEqual([]);
  await attestationPage({ limit: 5 }, signal);
  await attestationPage({ before: 'a b', limit: 200 }, signal);
  expect(fetch.mock.calls.map(call => call[0])).toEqual([
    '/v0/attestations',
    '/v0/attestations?limit=5',
    '/v0/attestations?limit=200&before=a+b',
  ]);
});

test.each([
  [400, 'invalid_query'],
  [503, 'ledger_unavailable'],
  [401, 'unauthorized'],
])('maps HTTP %s of the list to %s', async (status, code) => {
  vi.stubGlobal('window', {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    location: { assign: vi.fn() },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('upstream detail', { status })));
  await expect(attestationPage({}, new AbortController().signal)).rejects.toMatchObject({ code });
});
