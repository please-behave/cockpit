// A deterministic large-volume scenario. The same options always produce the same data.
// It is generated in memory on the first request and never written to disk.
const baseTime = Date.parse('2026-11-23T12:00:00Z');
const minute = 60_000;
const spanSeconds = 28 * 24 * 3600;
const ruleSource = 'github.com/please-behave/rules';
const owners = ['acme', 'globex', 'initech', 'umbrella', 'hooli', 'stark', 'wayne', 'wonka', 'oscorp', 'cyberdyne'];
const targets = [
  ['infrastructure', 'production'], ['infrastructure', 'staging'], ['infrastructure', 'canary'],
  ['platform', 'production'], ['platform', 'staging'], ['edge', 'eu-west'], ['edge', 'us-east'], ['edge', 'demo'],
].map(([owner, name]) => ({ owner: `github.com/volume/${owner}`, name }));
const ruleSets = [
  ['baseline', '1.0', 'Repository baseline'], ['security', '2.0', 'Security and release readiness'],
  ['licensing', '1.0', 'Licensing'], ['docs', '1.1', 'Documentation'],
  ['supply-chain', '1.0', 'Supply chain'], ['accessibility', '1.0', 'Accessibility'],
].map(([id, version, name]) => ({ source: ruleSource, path: `sets/${id}`, id, version, name }));
const kinds = [
  ['current', 70], ['pending', 4], ['overdue', 8], ['never_integrated', 5], ['unknown', 8], ['unmanaged', 5],
];
const statusTokens = {
  current: 'status-passed', pending: 'status-allowed', overdue: 'status-warning',
  never_integrated: 'status-failed', unknown: 'status-not-run',
};

export const volumeDefaults = { seed: 1, repositories: 1000, attestations: 20_000 };
const limits = { seed: [0, 2 ** 32 - 1], repositories: [1, 5000], attestations: [0, 100_000], delay: [0, 5000] };

/**
 * Reads the volume scenario options from the query and removes them from it. Returns undefined when the query
 * selects another scenario, and `invalid` when an option is not an integer within its bounds.
 */
export function volumeRequest(searchParams) {
  if (searchParams.get('preview') !== 'volume') return undefined;
  const options = { ...volumeDefaults, delay: 0 };
  let invalid = false;
  for (const [name, [min, max]] of Object.entries(limits)) {
    const raw = searchParams.get(name);
    searchParams.delete(name);
    if (raw === null) continue;
    const value = Number(raw);
    if (raw === '' || !Number.isInteger(value) || value < min || value > max) invalid = true;
    else options[name] = value;
  }
  searchParams.delete('preview');
  return { options, invalid };
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const hex = (rng, length) => Array.from({ length }, () => between(rng, 0, 15).toString(16)).join('');
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uuid = number => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const iso = time => new Date(time).toISOString();

function pick(rng, weighted) {
  let roll = rng() * weighted.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of weighted) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return weighted.at(-1)[0];
}

function generateRepositories(rng, count) {
  return Array.from({ length: count }, (_, index) => {
    const kind = index === 0 ? 'current' : pick(rng, kinds);
    const checked = kind !== 'never_integrated' && (kind !== 'unknown' && kind !== 'unmanaged' || rng() < 0.5);
    const platform = kind === 'unmanaged' ? 'gitlab.com' : 'github.com';
    return {
      kind,
      repository: `${platform}/${owners[index % owners.length]}/service-${String(index + 1).padStart(4, '0')}`,
      overall: checked ? pick(rng, kind === 'current' ? [['PASS', 90], ['FAIL', 7], ['ERROR', 3]] : [['PASS', 1]]) : null,
    };
  }).sort((a, b) => compare(a.repository, b.repository));
}

function generateAttestations(rng, repositories, count) {
  const eligible = repositories.filter(repository => repository.overall);
  const slots = Array.from({ length: count }, () => eligible[between(rng, 0, eligible.length - 1)]);
  // Every repository with a check keeps at least one attestation, taken from the oldest ones.
  const covered = new Set(slots);
  let oldest = count - 1;
  for (const repository of eligible) if (!covered.has(repository) && oldest >= 0) slots[oldest--] = repository;

  const newest = new Map();
  let elapsed = 0;
  const attestations = slots.map((repository, index) => {
    elapsed += between(rng, 30, 150) * 1000;
    const isNewest = !newest.has(repository.repository);
    const resultCount = between(rng, 1, 12);
    const warnCount = between(rng, 0, Math.min(3, resultCount));
    const summary = {
      id: uuid(count - index),
      received_at: iso(baseTime - elapsed),
      sender: 'ci@example.com',
      repository: repository.repository,
      commit: hex(rng, 40),
      execution_points: pick(rng, [[['check'], 70], [['build'], 10], [['release', 'deploy'], 10], [['deploy'], 10]]),
      overall: isNewest ? repository.overall : pick(rng, [['PASS', 92], ['FAIL', 5], ['ERROR', 3]]),
      warn_count: warnCount,
      not_run_count: between(rng, 0, Math.min(2, resultCount - warnCount)),
      result_count: resultCount,
    };
    if (isNewest) newest.set(repository.repository, summary);
    return summary;
  });
  return { attestations, newest };
}

function generateCompletedRuleSets(rng, repositories) {
  const byRepository = new Map();
  for (const { repository, kind } of repositories) {
    const sets = kind === 'never_integrated' || kind === 'unmanaged' ? [] : ruleSets.filter(() => rng() < 0.4);
    if (sets.length) byRepository.set(repository, sets);
  }
  return byRepository;
}

function generateReleases(rng, repositories, completed) {
  const releases = repositories.filter(({ kind }) => kind !== 'never_integrated' && kind !== 'unmanaged' && rng() < 0.8)
    .flatMap(({ repository }) => {
      const count = between(rng, 1, 4);
      const times = Array.from({ length: count }, () => baseTime - between(rng, 1, spanSeconds) * 1000).sort((a, b) => b - a);
      return times.map((time, index) => {
        const overall = rng() < 0.15 ? null : pick(rng, [['PASS', 85], ['FAIL', 10], ['ERROR', 5]]);
        return {
          repository,
          version: `1.${count - 1 - index}`,
          commit: hex(rng, 40),
          sender: 'ci@example.com',
          auth_method: pick(rng, [['github_oidc', 90], ['api_key', 10]]),
          received_at: iso(time),
          evidence: overall === null ? null : {
            overall, completed_rule_sets: overall === 'PASS' ? completed.get(repository) ?? [] : [],
          },
        };
      });
    })
    .sort((a, b) => compare(b.received_at, a.received_at)
      || compare(b.repository, a.repository) || compare(b.version, a.version));
  const latest = new Map();
  for (const release of releases) if (!latest.has(release.repository)) latest.set(release.repository, release);
  return { releases, latestReleases: [...latest.values()] };
}

function generateDeployments(rng, releases) {
  const byRepository = Map.groupBy(releases, release => release.repository);
  const drafts = [...byRepository].flatMap(([, facts]) => targets.filter(() => rng() < 0.3).map(target => {
    const fact = facts[between(rng, 0, facts.length - 1)];
    const received = Math.min(baseTime, Date.parse(fact.received_at) + between(rng, 1, 2000) * minute);
    return { target, fact, received, shape: pick(rng, [['recorded', 87], ['commit', 10], ['unrecorded', 3]]) };
  }));
  drafts.sort((a, b) => b.received - a.received);
  return drafts.map(({ target, fact, received, shape }, index) => {
    const common = {
      id: String(drafts.length - index),
      target,
      repository: fact.repository,
      sender: target.owner,
      auth_method: 'github_oidc',
      received_at: iso(received),
    };
    if (shape === 'unrecorded') {
      return { ...common, version: `unrecorded-${fact.version}`, reported_commit: null, commit: null,
        state: 'release_not_recorded', evidence: null };
    }
    return {
      ...common,
      version: shape === 'commit' ? null : fact.version,
      reported_commit: shape === 'commit' ? fact.commit : null,
      commit: fact.commit,
      state: fact.evidence ? 'evidence' : 'no_evidence',
      evidence: fact.evidence,
    };
  });
}

function overviewEntry(rng, { repository, kind, overall }, newest, latestRelease, latestDeployment) {
  const managed = kind !== 'unmanaged';
  const state = managed ? kind : 'unknown';
  const waiting = state === 'pending' || state === 'overdue';
  const attestation = newest.get(repository);
  const check = attestation && overall
    ? { id: attestation.id, commit: attestation.commit, overall, received_at: attestation.received_at }
    : null;
  const heartbeat = !managed || (state === 'unknown' && rng() < 0.5) ? null
    : state === 'unknown' ? baseTime - 2 * 86_400_000
    : baseTime - (state === 'pending' ? 25 : 5) * minute;
  const minutesWaiting = state === 'pending' ? 10 : rng() < 0.3 ? 8 * 24 * 60 : 150;
  const observedAt = iso(baseTime - minutesWaiting * minute);
  const step = state === 'overdue' ? between(rng, 1, 4) : null;
  return {
    repository, managed, platform: managed ? 'github' : null, state,
    heartbeat_completed_at: heartbeat === null ? null : iso(heartbeat),
    status_token: statusTokens[state],
    latest_check: check,
    head: heartbeat === null ? null : {
      branch: 'main', commit: waiting ? hex(rng, 40) : check?.commit ?? hex(rng, 40),
      observed_at: observedAt, committed_at: observedAt, direct_evidence: check !== null && !waiting,
    },
    pending_since: waiting ? observedAt : null,
    pending_age_seconds: waiting ? minutesWaiting * 60 : null,
    overdue_step: step, overdue_steps: step ? 4 : null,
    observed_heads_since_evidence: state === 'overdue' ? 2 : state === 'current' ? 0 : 1,
    last_evidence_at: check?.received_at ?? null,
    latest_release: latestRelease
      ? { version: latestRelease.version, commit: latestRelease.commit, received_at: latestRelease.received_at } : null,
    latest_deployment: latestDeployment
      ? { ...latestDeployment.target, received_at: latestDeployment.received_at } : null,
  };
}

/** Generates the repository overview, newest-first attestations, releases, deployments and completed Rule Sets. */
export function generateVolume({ seed, repositories: repositoryCount, attestations: attestationCount }) {
  const rng = random(seed);
  const repositories = generateRepositories(rng, repositoryCount);
  const { attestations, newest } = generateAttestations(rng, repositories, attestationCount);
  const completed = generateCompletedRuleSets(rng, repositories);
  const { releases, latestReleases } = generateReleases(rng, repositories, completed);
  const deployments = generateDeployments(rng, releases);
  const latestRelease = new Map(latestReleases.map(release => [release.repository, release]));
  const latestDeployment = new Map();
  for (const deployment of deployments) {
    if (!latestDeployment.has(deployment.repository)) latestDeployment.set(deployment.repository, deployment);
  }
  return {
    overview: {
      heartbeat: { completed_at: iso(baseTime - 25 * minute), stale: false },
      repositories: repositories.map(repository => overviewEntry(rng, repository, newest,
        latestRelease.get(repository.repository), latestDeployment.get(repository.repository))),
    },
    attestations,
    releases,
    latestReleases,
    deployments,
    completedRuleSets: [...completed].map(([repository, sets]) => ({ repository, sets })),
  };
}
