import { expect, test } from 'vitest';
import type {
  Attestation, Deployment, RegisteredRule, RegisteredRuleSet, RegisteredRuleSetVersion, RegisteredVersion, RepositoryOverview, RepositoryRuleSets, RuleSetCompliance, ReleaseDetail, ReleaseSummary, Summary,
} from '../../frontend/src/api/client';
import { repositoryHealth } from '../../frontend/src/repository-health';
import { fixtureTargets, respond, statusPillLabels } from './fixtures.mjs';

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
  for (const optional of [rule.name, rule.description, rule.owner]) {
    expect(optional === undefined || isString(optional)).toBe(true);
  }
}

test('serves latest summaries in the client shape', () => {
  const latest = body<Summary[]>(fixtureTargets.latest);
  expect(latest.length).toBeGreaterThan(1);
  latest.forEach(expectSummary);
  expect(new Set(latest.map(summary => summary.overall))).toEqual(new Set(['PASS', 'FAIL', 'ERROR']));
  const points = Map.groupBy(latest, summary => summary.repository);
  expect([...points.values()].some(tiles => tiles.length > 1)).toBe(true);
});

test.each([fixtureTargets.repositoryOverview, fixtureTargets.latest, fixtureTargets.history])('delays %s for refresh review', target => {
  expect(respond(`${target}?preview=slow-refresh`)).toEqual({ ...respond(target), delay: 750 });
});

test('serves completed Rule Sets in the client shape, including short, long and untrusted names', () => {
  const repositories = body<RepositoryRuleSets[]>(fixtureTargets.completedRuleSets);
  const overview = body<RepositoryOverview>(fixtureTargets.repositoryOverview).repositories;
  expect(overview.some(summary => !repositories.some(entry => entry.repository === summary.repository))).toBe(true);
  for (const { repository, sets } of repositories) {
    expect(overview.some(summary => summary.repository === repository)).toBe(true);
    expect(sets.length).toBeGreaterThan(0);
    for (const { source, path, id, version, name } of sets) {
      expect([source, path, id, name].every(isString)).toBe(true);
      expect(version).toMatch(/^\d+\.\d+$/);
    }
  }
  const names = repositories.flatMap(entry => entry.sets.map(set => set.name));
  expect(names).toContain('Repository baseline');
  expect(names.some(name => name.length > 80)).toBe(true);
  expect(names.some(name => name.includes('<img'))).toBe(true);
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
    for (const binding of attestation.rule_sets ?? []) {
      expect([binding.source, binding.path, binding.id].every(isString)).toBe(true);
      expect(binding.version).toMatch(/^\d+\.\d+$/);
      expect(binding.execution_points.every(isString)).toBe(true);
    }
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
  expect(statusPillLabels).toEqual(expect.arrayContaining([...statuses]));
  const errorDetail = fixtureTargets.details.map(target => body<Attestation>(target))
    .find(attestation => attestation.overall === 'ERROR');
  expect(new Set(errorDetail?.results.map(item => item.status))).toEqual(statuses);
  expect(verifications).toEqual(new Set(['verified', 'unverified']));
  const grouped = body<Attestation>(fixtureTargets.details[0]);
  expect(grouped.rule_sets?.map(set => set.id)).toEqual(['baseline', 'security', 'markup', 'unregistered-set']);
  expect(body<Attestation>(fixtureTargets.details[1]).rule_sets).toEqual([]);
  expect(body<Attestation>(fixtureTargets.details[2])).not.toHaveProperty('rule_sets');
  const mixed = grouped.results;
  expect(mixed.find(item => item.id === 'run-5')?.name).toBe('License file present (older)');
  expect(mixed.find(item => item.id === 'run-6')).not.toHaveProperty('name');
  expect(mixed.find(item => item.id === 'run-9')?.name).toContain('<img');
  const scrollable = body<Summary[]>(fixtureTargets.latest).find(summary =>
    summary.repository === 'github.com/acme/return-navigation',
  )!;
  const { results } = body<Attestation>(`/v0/attestations/${scrollable.id}`);
  expect(new Set(results.map(item => item.id)).size).toBe(36);
  expect(new Set(results.map(item => item.status))).toEqual(new Set(['WARN', 'PASS']));
  expect(results.at(-2)?.verification).toEqual({ status: 'unverified', reason: 'mismatch' });
  expect(results.at(-1)?.rule).toMatchObject({ id: 'design-review', version: '2.0' });
  const factStrip = body<Summary[]>(fixtureTargets.latest).find(summary =>
    summary.repository.endsWith('/fact-strip'),
  )!;
  expect(factStrip.repository.length).toBeGreaterThan(70);
  expect(factStrip.commit).toMatch(/^[0-9a-f]{40}$/);
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
  const longIdentity = rules.find(rule => rule.name === 'Review with long texts')!;
  expect([longIdentity.source.split('/').at(-1), longIdentity.path, longIdentity.id])
    .toSatisfy((fields: string[]) => fields.every(field => field.length > 70));
  expect(longIdentity.owner).toHaveLength(longIdentity.source.length);
  expect(rules.find(rule => rule.id === 'markup')?.owner).toContain('<img');
  expect(rules.find(rule => rule.id === 'no-secrets')).not.toHaveProperty('owner');

  const sets = fixtureTargets.ruleSetDetails.flatMap(target => body<RegisteredRuleSetVersion[]>(target));
  let longest = 0;
  for (const target of fixtureTargets.ruleDetails) {
    const versions = body<RegisteredVersion[]>(target);
    const latest = versions.at(-1)!;
    const summary = rules.find(rule => rule.source === latest.source && rule.path === latest.path && rule.id === latest.id);
    expect(summary).toBeDefined();
    expect(summary?.owner).toBe(latest.owner);
    longest = Math.max(longest, versions.length);
    for (const version of versions) {
      expectRule(version);
      for (const membership of version.rule_sets ?? []) {
        const set = sets.find(set => set.source === membership.source && set.path === membership.path
          && set.id === membership.id && set.version === membership.version);
        expect(set?.name || set?.id).toBe(membership.name);
        expect(set?.members.some(member => member.source === version.source && member.path === version.path
          && member.id === version.id && member.version === version.version)).toBe(true);
      }
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
  expect(next.map(rule => rule.id)).toEqual(['sample-b', 'versioned-review', 'zebra', 'zsh', 'zsh']);
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

test('serves Rule Sets, latest rule memberships and current repository compliance', () => {
  const sets = body<RegisteredRuleSet[]>(fixtureTargets.ruleSets);
  const rules = body<RegisteredRule[]>(`${fixtureTargets.rules}?limit=200`);
  expect(new Set(rules.filter(rule => rule.id === 'zsh').map(rule => rule.source)).size).toBe(2);
  expect(rules.find(rule => rule.id === 'license-file')?.rule_sets?.map(set => set.id))
    .toEqual(['baseline', 'licensing', 'security']);
  expect(rules.find(rule => rule.id === 'zsh')?.rule_sets).toEqual([]);
  for (const [index, set] of sets.entries()) {
    expect(set.scan.registrations).toBeGreaterThanOrEqual(sets.length);
    expect(set.member_count).toBe(rules.filter(rule => rule.rule_sets?.some(membership => membership.id === set.id)).length);
    const bindings = body<RuleSetCompliance[]>(fixtureTargets.ruleSetCompliance[index]);
    if (set.id === 'baseline') expect(bindings).toEqual([
      expect.objectContaining({ complete: false, version: '0.9', non_passing_members: [expect.objectContaining({ status: 'WARN' })] }),
      expect.objectContaining({ repository: 'github.com/acme/pending', complete: true, version: '0.9' }),
      expect.objectContaining({ complete: true, version: '1.0' }),
    ]);
    if (set.id === 'unbound') expect(bindings).toEqual([]);
  }
  const [{ source, path, id, version, scan }] = sets;
  const query = new URLSearchParams({ limit: '1', before: JSON.stringify({ source, path, id, version, scan }) });
  expect(body<RegisteredRuleSet[]>(`${fixtureTargets.ruleSets}?${query}`)).toEqual(sets.slice(1, 2));
});

test('answers unknown API routes and leaves other paths to the server', () => {
  expect(respond('/v0/nothing')).toEqual({ status: 404, body: { code: 'route_not_found' } });
  expect(respond('/rules')).toBeUndefined();
});

test('serves Rule Set histories with valid member links, including a historical version with sparse knowledge', () => {
  const sets = body<RegisteredRuleSet[]>(fixtureTargets.ruleSets);
  const rules = fixtureTargets.ruleDetails.flatMap(target => body<RegisteredVersion[]>(target));
  for (const target of fixtureTargets.ruleSetDetails) {
    const versions = body<RegisteredRuleSetVersion[]>(target);
    const latest = versions.at(-1)!;
    const summary = sets.find(set => set.id === latest.id)!;
    if (latest.id === 'baseline') expect(latest.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.stringContaining('long-identifier'), enabled: false }),
    ]));
    expect(latest.version).toBe(summary.version);
    expect(latest.members).toHaveLength(summary.member_count);
    for (const version of versions) {
      expect([version.source, version.path, version.id]).toEqual([summary.source, summary.path, summary.id]);
      expect(version.version).toMatch(/^\d+\.\d+$/);
      expect(version.digest).toMatch(/^v1:sha256:[0-9a-f]{64}$/);
      expect(version.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(Date.parse(version.registered_at)).not.toBeNaN();
      for (const member of version.members) {
        expect(rules.some(rule => rule.source === member.source && rule.path === member.path &&
          rule.id === member.id && rule.version === member.version && rule.digest === member.digest)).toBe(true);
        expect(typeof member.enabled).toBe('boolean');
      }
    }
  }
  const baseline = body<RegisteredRuleSetVersion[]>(fixtureTargets.ruleSetDetails.find(target => target.endsWith('id=baseline'))!);
  expect(baseline.map(version => version.version)).toEqual(['0.9', '1.0']);
  expect(baseline[0].knowledge).toHaveProperty('future');
  expect(baseline[0].knowledge).not.toHaveProperty('audience');
  expect(baseline[1].knowledge?.admission).toHaveLength(2);
});

test('serves paged release summaries and repository history in the client shape', () => {
  const first = body<ReleaseSummary[]>(fixtureTargets.releases);
  const { repository, version } = first.at(-1)!;
  const before = new URLSearchParams({ before: JSON.stringify({ repository, version }) });
  const next = body<ReleaseSummary[]>(`${fixtureTargets.releases}?${before}`);
  const all = [...first, ...next];
  expect(first).toHaveLength(100);
  expect(next.length).toBeGreaterThan(0);
  expect(new Set(all.map(entry => entry.repository)).size).toBe(all.length);
  expect(new Set(all.map(entry => entry.evidence?.overall))).toEqual(new Set([undefined, 'PASS', 'FAIL', 'ERROR']));
  for (const entry of all) {
    expect(entry).toEqual(expect.objectContaining({
      repository: expect.any(String), version: expect.any(String), commit: expect.stringMatching(/^[0-9a-f]{40}$/),
      sender: expect.any(String), auth_method: expect.stringMatching(/^(github_oidc|api_key)$/), received_at: expect.any(String),
    }));
    expect(entry).toHaveProperty('evidence');
    expect(Number.isNaN(Date.parse(entry.received_at))).toBe(false);
    for (const set of entry.evidence?.completed_rule_sets ?? []) {
      expect(set).toEqual(expect.objectContaining({
        source: expect.any(String), path: expect.any(String), id: expect.any(String),
        version: expect.any(String), name: expect.any(String),
      }));
    }
  }
  const history = body<ReleaseSummary[]>(fixtureTargets.releaseHistory);
  expect(history.map(entry => entry.version)).toEqual(['2.0', '1.11', '1.9']);
  expect(history[0]).toEqual(all.find(entry => entry.repository === history[0].repository));
  expect(body<ReleaseSummary[]>('/v0/releases?repository=unknown')).toEqual([]);
  expect(respond('/v0/releases/latest?before=invalid')?.status).toBe(400);
});

test('serves release details with the complete evidence in the client shape', () => {
  const details = fixtureTargets.releaseDetails.map(target => body<ReleaseDetail>(target));
  expect(details.map(detail => detail.evidence?.overall)).toEqual(expect.arrayContaining([undefined, 'PASS', 'FAIL', 'ERROR']));
  expect(details.map(detail => detail.auth_method)).toEqual(expect.arrayContaining(['api_key', 'github_oidc']));
  for (const detail of details) {
    expect(detail.commit).toMatch(/^[0-9a-f]{40}$/);
    if (detail.evidence === null) continue;
    expect(Object.keys(detail.evidence).sort()).toEqual(['auth_method', 'id', 'overall', 'received_at', 'rule_sets', 'sender']);
    for (const set of detail.evidence.rule_sets) {
      expect(set.complete).toBe(set.non_passing_members.length === 0);
    }
  }
  expect(details.some(detail => detail.evidence?.rule_sets.some(set => !set.complete))).toBe(true);
  expect(respond('/v0/releases/detail?repository=x')?.status).toBe(400);
  expect(respond('/v0/releases/detail?repository=x&version=y')?.status).toBe(404);
});

test('filters the attestation history by exact repository before paging', () => {
  const repository = 'github.com/acme/widget';
  const filter = `repository=${encodeURIComponent(repository)}`;
  const first = body<Summary[]>(`${fixtureTargets.history}?limit=2&${filter}`);
  const second = body<Summary[]>(`${fixtureTargets.history}?limit=2&${filter}&before=${first[1].id}`);
  expect(first).toHaveLength(2);
  expect(second).toHaveLength(2);
  for (const summary of [...first, ...second]) {
    expectSummary(summary);
    expect(summary.repository).toBe(repository);
  }
  expect(second[0].id < first[1].id).toBe(true);
  expect(body<Summary[]>(`${fixtureTargets.history}?repository=github.com%2Facme`)).toEqual([]);
  for (const query of ['repository=', 'repository=%00', `${filter}&${filter}`]) {
    expect(respond(`${fixtureTargets.history}?${query}`)?.status).toBe(400);
  }
});

test('serves all current deployment states and continues from the last event ID', () => {
  const path = fixtureTargets.deployments;
  const first = body<Deployment[]>(path);
  const next = body<Deployment[]>(path + '?before=' + first.at(-1)!.id);
  const entries = [...first, ...next];
  expect(first).toHaveLength(100);
  expect(next.length).toBeGreaterThan(0);
  expect(new Set(entries.map(({ target, repository }) =>
    JSON.stringify([target.owner, target.name, repository]))).size).toBe(entries.length);
  expect(new Set(entries.map(entry => entry.state)))
    .toEqual(new Set(['evidence', 'no_evidence', 'release_not_recorded']));
  expect(new Set(entries.map(entry => entry.evidence?.overall))).toEqual(new Set([undefined, 'PASS', 'FAIL', 'ERROR']));
  expect(entries.some(entry => entry.target.name.length === 64 && entry.target.owner.length > 100)).toBe(true);
  for (const [index, entry] of entries.entries()) {
    expect(entry.id).toMatch(/^[1-9][0-9]*$/);
    if (index > 0) expect(Number(entry.id)).toBeLessThan(Number(entries[index - 1].id));
    expect(entry.sender).toBe(entry.target.owner);
    expect(Date.parse(entry.received_at)).not.toBeNaN();
    expect(entry.version === null).toBe(entry.reported_commit !== null);
    if (entry.reported_commit !== null) expect(entry.commit).toBe(entry.reported_commit);
    if (entry.state === 'release_not_recorded') expect(entry.commit).toBeNull();
    else expect(entry.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(entry.evidence !== null).toBe(entry.state === 'evidence');
  }
  const repository = entries[0].repository;
  expect(body<Deployment[]>(path + '?' + new URLSearchParams({ repository, limit: '200' })))
    .toEqual(entries.filter(entry => entry.repository === repository));
  expect(respond(path + '?before=0')?.status).toBe(400);
});

test('serves status tile fixtures for empty, truncated and escaped previews', () => {
  const overview = body<RepositoryOverview>(fixtureTargets.repositoryOverview);
  const statTiles = body<RepositoryOverview>(`${fixtureTargets.repositoryOverview}?preview=stat-tiles`);
  expect(statTiles).toEqual({
    ...overview,
    repositories: overview.repositories.filter(entry => repositoryHealth(entry) !== 'warning'),
  });
  expect(statTiles.repositories.filter(entry => repositoryHealth(entry) === 'failed')).toHaveLength(4);
  expect(statTiles.repositories.find(entry => entry.repository.includes('<img'))).toMatchObject({
    state: 'current', latest_check: { overall: 'PASS' },
  });
});

test('serves the repository map fixtures with every health group and a long unbroken name', () => {
  const { repositories } = body<RepositoryOverview>(fixtureTargets.repositoryMap);
  expect(new Set(repositories.map(repositoryHealth))).toEqual(new Set(['failed', 'warning', 'not-run', 'passed']));
  expect(repositories).toEqual(expect.arrayContaining(body<RepositoryOverview>(fixtureTargets.repositoryOverview).repositories));
  expect(repositories.find(entry => entry.repository.endsWith('-map'))).toMatchObject({
    repository: expect.stringMatching(/\/[^/\s]{160,}$/),
    state: 'current',
    latest_check: { overall: 'PASS' },
    latest_release: null,
    latest_deployment: null,
  });
});

test('serves repository health, evidence and covering syncs in the client shape', () => {
  const { heartbeat, repositories } = body<RepositoryOverview>(fixtureTargets.repositoryOverview);
  expect(heartbeat.completed_at).toBe(repositories.flatMap(entry => entry.heartbeat_completed_at ?? []).sort()[0]);
  expect(heartbeat.stale).toBe(true);
  expect(new Set(repositories.map(entry => entry.state)))
    .toEqual(new Set(['current', 'pending', 'overdue', 'never_integrated', 'unknown']));
  expect(new Set(repositories.flatMap(entry => entry.latest_check?.overall ?? [])))
    .toEqual(new Set(['PASS', 'FAIL', 'ERROR']));
  expect(repositories.some(entry => entry.state === 'unknown' && !entry.heartbeat_completed_at)).toBe(true);
  expect(repositories.some(entry => entry.state === 'unknown' && entry.heartbeat_completed_at)).toBe(true);
  expect(repositories.find(entry => !entry.managed)).toMatchObject({ platform: null, state: 'unknown' });
  expect(repositories.find(entry => entry.state === 'never_integrated')?.latest_check).toBeNull();
  expect(repositories.map(entry => entry.repository)).not.toContain('github.com/acme/archived');
  const byName = (name: string) => repositories.find(entry => entry.repository.endsWith(`/${name}`))!;
  const both = byName('return-navigation');
  const [release] = body<ReleaseSummary[]>(fixtureTargets.releaseHistory);
  const [deployment] = body<Deployment[]>(fixtureTargets.deployments);
  expect(both.latest_release).toEqual({
    version: release.version, commit: release.commit, received_at: release.received_at,
  });
  expect(both.latest_deployment).toEqual({ ...deployment.target, received_at: deployment.received_at });
  expect(byName('pending')).toMatchObject({ latest_release: null, latest_deployment: { name: 'staging' } });
  expect(byName('gadget')).toMatchObject({ latest_release: { version: '1.0' }, latest_deployment: null });
  expect(byName('no-records')).toMatchObject({ latest_release: null, latest_deployment: null });
  const sets = body<RepositoryRuleSets[]>(fixtureTargets.completedRuleSets);
  expect(sets.find(entry => entry.repository === both.repository)?.sets).toHaveLength(3);
  for (const entry of repositories) {
    expect(entry.observed_heads_since_evidence).toSatisfy(isCount);
    if (entry.state === 'pending' || entry.state === 'overdue') {
      expect(entry.head?.direct_evidence).toBe(false);
      expect(entry.head?.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(entry.pending_age_seconds).toSatisfy(isCount);
      expect(Date.parse(entry.pending_since!)).not.toBeNaN();
    }
  }
});
