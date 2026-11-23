import { expect, test } from 'vitest';
import type { Attestation, RegisteredRule, RegisteredVersion, Summary } from '../../frontend/src/api/client';
import { fixtureTargets, respond } from './fixtures.mjs';

const isString = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

function body<T>(target: string): T {
  const response = respond(target)!;
  expect(response.status, target).toBe(200);
  return response.body as T;
}

function expectSummary(summary: Summary) {
  expect(summary.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(Number.isNaN(Date.parse(summary.received_at))).toBe(false);
  expect([summary.sender, summary.repository, summary.commit].every(isString)).toBe(true);
  expect(summary.execution_points.every(isString)).toBe(true);
  expect(['PASS', 'FAIL', 'ERROR']).toContain(summary.overall);
  expect([summary.warn_count, summary.not_run_count, summary.result_count].every(isCount)).toBe(true);
}

function expectRule(rule: RegisteredRule | RegisteredVersion) {
  expect([rule.source, rule.path, rule.id]).toSatisfy((values: string[]) => values.every(value => isString(value) && value));
  expect(rule.version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  expect(['check', 'review']).toContain(rule.kind);
  for (const optional of [rule.name, rule.description]) expect(optional === undefined || isString(optional)).toBe(true);
}

test('serves latest summaries in the client shape', () => {
  const latest = body<Summary[]>(fixtureTargets.latest);
  expect(latest.length).toBeGreaterThan(1);
  latest.forEach(expectSummary);
  expect(new Set(latest.map(summary => summary.overall))).toEqual(new Set(['PASS', 'FAIL', 'ERROR']));
  const points = Map.groupBy(latest, summary => summary.repository);
  expect([...points.values()].some(tiles => tiles.length > 1)).toBe(true);
});

test('pages the history newest first with limit and before', () => {
  const first = body<Summary[]>(fixtureTargets.history);
  first.forEach(expectSummary);
  expect(first).toHaveLength(100);
  const next = body<Summary[]>(`${fixtureTargets.history}?before=${first.at(-1)!.id}`);
  expect(next.length).toBeGreaterThan(0);
  expect(next.length).toBeLessThan(100);
  expect(next[0].id < first.at(-1)!.id).toBe(true);
  expect(body<Summary[]>(`${fixtureTargets.history}?limit=3`)).toHaveLength(3);
  expect(respond(`${fixtureTargets.history}?limit=0`)!.status).toBe(400);
});

test('serves every attestation in the client shape with matching counts', () => {
  const statuses = new Set<string>();
  const verifications = new Set<string>();
  for (const target of fixtureTargets.details) {
    const attestation = body<Attestation>(target);
    expectSummary(attestation);
    expect(attestation.results).toHaveLength(attestation.result_count);
    expect(attestation.results.filter(item => item.status === 'WARN')).toHaveLength(attestation.warn_count);
    expect(attestation.results.filter(item => item.status === 'NOT_RUN')).toHaveLength(attestation.not_run_count);
    for (const item of attestation.results) {
      expect(['check', 'review', 'integrity']).toContain(item.kind);
      expect(['PASS', 'FAIL', 'ERROR', 'NOT_RUN', 'WARN']).toContain(item.status);
      if (item.name !== undefined) expect(item.name).toSatisfy(isString);
      statuses.add(item.status);
      verifications.add(item.verification.status);
      if (item.verification.status === 'unverified') expect(['unregistered', 'mismatch']).toContain(item.verification.reason);
    }
  }
  expect(statuses.size).toBe(5);
  expect(verifications).toEqual(new Set(['verified', 'unverified']));
  const mixed = body<Attestation>(fixtureTargets.details[0]).results;
  expect(mixed.find(item => item.id === 'run-5')?.name).toBe('License file present (older)');
  expect(mixed.find(item => item.id === 'run-6')).not.toHaveProperty('name');
  expect(mixed.find(item => item.id === 'run-9')?.name).toContain('<img');
  const scrollable = body<Summary[]>(fixtureTargets.latest).find(summary =>
    summary.repository === 'github.com/acme/return-navigation',
  )!;
  const { results } = body<Attestation>(`/v0/attestations/${scrollable.id}`);
  expect(new Set(results.map(item => item.id)).size).toBe(36);
  expect(results.at(-2)?.verification).toEqual({ status: 'unverified', reason: 'mismatch' });
  expect(results.at(-1)?.rule).toMatchObject({ id: 'design-review', version: '2.0' });
  expect(respond('/v0/attestations/missing')!.status).toBe(404);
});

test('serves registered rules and their versions in the client shape', () => {
  const rules = body<RegisteredRule[]>(`${fixtureTargets.rules}?limit=200`);
  for (const rule of rules) {
    expectRule(rule);
    expect(Number.isInteger(rule.scan.through)).toBe(true);
    expect(rule.scan.registrations).toBeGreaterThanOrEqual(rules.length);
  }
  expect(rules).toHaveLength(fixtureTargets.ruleDetails.length);

  let longest = 0;
  for (const target of fixtureTargets.ruleDetails) {
    const versions = body<RegisteredVersion[]>(target);
    longest = Math.max(longest, versions.length);
    for (const version of versions) {
      expectRule(version);
      expect(version.digest).toMatch(/^v1:sha256:[0-9a-f]{64}$/);
      expect(version.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(Number.isNaN(Date.parse(version.registered_at))).toBe(false);
      if (version.kind === 'review') {
        expect(typeof version.blocking).toBe('boolean');
        expect(isString(version.prompt)).toBe(true);
      } else {
        expect(version).not.toHaveProperty('blocking');
        expect(version).not.toHaveProperty('prompt');
      }
    }
    expect(versions.map(version => Number(version.version.replace('.', '')))).toEqual(
      versions.map(version => Number(version.version.replace('.', ''))).toSorted((a, b) => a - b),
    );
  }
  expect(longest).toBeGreaterThan(2);
  expect(respond('/v0/rules/detail?source=a&path=b&id=c')!.status).toBe(404);
  expect(respond('/v0/rules/detail')!.status).toBe(400);
});

test('pages the registered rules in ledger order and rejects invalid cursors', () => {
  const first = body<RegisteredRule[]>(fixtureTargets.rules);
  expect(first).toHaveLength(100);
  const { source, path, id, version, scan } = first.at(-1)!;
  const cursor = { source, path, id, version, scan };
  const target = (before: unknown) =>
    `${fixtureTargets.rules}?${new URLSearchParams({ before: JSON.stringify(before) })}`;
  const next = body<RegisteredRule[]>(target(cursor));
  expect(id).toBe('sample-a');
  expect(next.map(rule => rule.id)).toEqual(['sample-b', 'zebra']);
  expect([...first, ...next]).toEqual(body<RegisteredRule[]>(`${fixtureTargets.rules}?limit=200`));
  const names = [...first, ...next].map(rule => (rule.name ?? rule.id).toLowerCase());
  expect(names).toEqual(names.toSorted());
  for (const invalid of [
    { source, path, id },
    { ...cursor, id: 'missing' },
    { ...cursor, version: '1.0' },
    { ...cursor, scan: { ...scan, through: scan.through - 1 } },
    { ...cursor, scan: { ...scan, registrations: scan.registrations - 1 } },
  ]) {
    expect(respond(target(invalid))).toEqual({ status: 400, body: { code: 'invalid_query' } });
  }
});

test('answers unknown API routes and leaves other paths to the server', () => {
  expect(respond('/v0/nothing')).toEqual({ status: 404, body: { code: 'route_not_found' } });
  expect(respond('/rules')).toBeUndefined();
});
