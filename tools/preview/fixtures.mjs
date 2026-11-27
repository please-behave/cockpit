const markup = '<img src=x onerror=alert(1)>';
const longOwner = 'an-organization-with-an-unreasonably-long-name-that-has-to-wrap';
const longName = 'a-repository-name-that-keeps-going-and-going-until-it-has-to-wrap-on-every-narrow-tile';
const longText = 'This text is deliberately long so that it has to wrap on narrow screens without breaking the layout. '.repeat(6).trim();
const sha = digit => digit.repeat(40);

const ruleSource = 'github.com/please-behave/rules';

const rules = [
  rule('check', 'checks/license', 'license-file', ['1.0', '1.1', '2.0'], {
    name: 'License file present',
    description: 'The repository contains a license file.',
    knowledge: {
      purpose: 'Make the terms of use of the repository explicit.',
      problem: 'Without a license nobody may legally use the code.',
      conditions: [{ statement: 'A LICENSE file exists in the repository root.', rationale: 'Tools look for it there.' }],
      out_of_scope: [{ description: 'Compatibility of dependency licenses.', owner: 'dependency-licenses' }],
      references: ['https://choosealicense.com'],
    },
  }),
  rule('check', 'checks/security', 'no-secrets', ['1.0'], { name: 'No secrets in the repository' }, [undefined]),
  rule('review', 'reviews/design', 'design-review', ['1.0', '1.1', '1.2', '2.0'], {
    name: 'Design review',
    description: 'A reviewer judges whether the change fits the architecture.',
    prompt: 'Review the change for architectural fit.\nName every module that it touches and judge the dependency direction.',
    blocking: true,
    knowledge: { purpose: 'Keep the architecture coherent.', limitations: ['Only as good as the reviewer.'] },
  }, ['design-review-key', ruleSource, ruleSource, ruleSource]),
  rule('review', 'reviews/docs', 'docs-review', ['1.0'], { prompt: 'Is every public change documented?', blocking: false }),
  rule('check', 'checks/long', 'rule-with-a-very-long-identifier-that-needs-to-wrap-on-narrow-screens', ['1.0'], {
    name: `Rule with a very long name: ${longText}`,
    description: longText,
  }),
  rule('review', `reviews/${longName}`, `review-${longName}`, ['1.0', '1.1'], {
    source: `github.com/${longOwner}/${longName}`,
    name: 'Review with long texts',
    description: longText,
    prompt: `${longText}\n${markup}`,
    blocking: false,
    knowledge: {
      purpose: longText,
      conditions: [{ statement: longText, rationale: longText }, { statement: 'Allow conditions without a reason.' }],
      future_field: { text: markup },
    },
  }, [ruleSource, `github.com/${longOwner}/${longName}`]),
  rule('check', 'checks/markup', 'markup', ['1.0'], {
    name: `<b>${markup}</b>`,
    description: `<script>alert(1)</script> ${markup}`,
    knowledge: {
      purpose: markup,
      conditions: [{ statement: '<b>bold</b>', rationale: markup }],
      references: [`<a href="javascript:alert(1)">${markup}</a>`],
    },
  }, [markup]),
  rule('review', 'reviews/versioned', 'versioned-review', ['1.0', '1.2', '2.0'], {
    name: 'Versioned review',
    description: 'Review the scope of the change.',
    prompt: `Does the change match its stated scope?\nTreat ${markup} as plain text.`,
    blocking: true,
    knowledge: { purpose: 'Keep the change within its intended scope.' },
  }),
  rule('check', 'checks/sample', 'sample-b', ['1.0'], { name: 'Tie at page boundary' }),
  rule('check', 'checks/sample', 'sample-a', ['1.0', '2.0'], { name: 'tie at page boundary' }),
  rule('check', 'checks/sample', 'zebra', ['1.0'], { name: 'Zebra' }),
  ...['github.com/acme/cli', 'github.com/acme/dashboard'].map(source =>
    rule('check', 'checks/zsh', 'zsh', ['1.0'], { source, name: 'Zsh syntax', description: 'Parse the repository scripts.' })),
  ...Array.from({ length: 92 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return rule('check', 'checks/sample', `sample-${number}`, ['1.0'], { name: `Sample rule ${number}` });
  }),
];

function rule(kind, path, id, versions, details, owners = versions.map(() => details.source ?? ruleSource)) {
  return versions.map((version, index) => ({
    source: ruleSource,
    path,
    id,
    version,
    kind,
    ...details,
    ...(owners[index] === undefined ? {} : { owner: owners[index] }),
    ...(index === versions.length - 1 || !details.name ? {} : { name: `${details.name} (older)` }),
    digest: `v1:sha256:${String(index + 1).repeat(64)}`,
    commit: sha(String(index + 1)),
    registered_at: `2026-0${index + 1}-1${index}T09:30:00Z`,
  }));
}

const identity = (path, id, version) => ({ source: ruleSource, path, id, ...(version ? { version } : {}) });

function result(id, kind, status, ruleIdentity, verification = { status: 'verified' }) {
  const registration = ruleIdentity && rules.flat().find(rule =>
    rule.source === ruleIdentity.source && rule.path === ruleIdentity.path
    && rule.id === ruleIdentity.id && rule.version === ruleIdentity.version,
  );
  return {
    id, kind, status, verification,
    ...(ruleIdentity ? { rule: ruleIdentity } : {}),
    ...(registration?.name ? { name: registration.name } : {}),
  };
}

const verifiedResults = [
  result('run-1', 'check', 'PASS', identity('checks/license', 'license-file', '2.0')),
  result('run-2', 'check', 'PASS', identity('checks/security', 'no-secrets', '1.0')),
  result('run-3', 'review', 'PASS', identity('reviews/design', 'design-review', '2.0')),
];

const mismatchedResult = result('run-5', 'check', 'PASS', identity('checks/license', 'license-file', '1.0'),
  { status: 'unverified', reason: 'mismatch' });

const mixedResults = [
  result('run-1', 'check', 'FAIL', identity('checks/license', 'license-file', '2.0')),
  result('run-2', 'check', 'WARN', identity('checks/security', 'no-secrets', '1.0')),
  result('run-3', 'review', 'NOT_RUN', identity('reviews/design', 'design-review', '2.0')),
  result('run-4', 'review', 'PASS', identity('reviews/docs', 'docs-review', '1.0')),
  mismatchedResult,
  result('run-6', 'check', 'PASS', { source: 'github.com/acme/widget', path: 'checks/unknown', id: 'unregistered-rule' }, { status: 'unverified', reason: 'unregistered' }),
  result('run-7', 'integrity', 'PASS', undefined, { status: 'unverified', reason: 'unregistered' }),
  result('run-8', 'check', 'PASS', identity('checks/long', 'rule-with-a-very-long-identifier-that-needs-to-wrap-on-narrow-screens', '1.0')),
  result('run-9', 'check', 'PASS', identity('checks/markup', 'markup', '1.0')),
];

const errorResults = [
  result('run-1', 'check', 'ERROR', identity('checks/security', 'no-secrets', '1.0')),
  result('run-2', 'review', 'NOT_RUN', identity('reviews/design', 'design-review', '2.0')),
];

const scrollableResults = Array.from({ length: 36 }, (_, index) => ({
  ...(index === 34 ? mismatchedResult : verifiedResults[index % verifiedResults.length]),
  ...(index % 7 === 0 ? { status: 'WARN' } : {}),
  id: `scroll-result-${index + 1}`,
}));

const newest = [
  ['acme/widget', ['deploy'], 'FAIL', mixedResults, '9'],
  ['acme/widget', ['build'], 'PASS', verifiedResults, '8'],
  ['acme/widget', ['release', 'deploy'], 'PASS', verifiedResults, '7'],
  ['acme/gadget', [], 'ERROR', errorResults, '6'],
  ['acme/single', ['deploy'], 'PASS', verifiedResults.slice(0, 1), '5'],
  ['acme/empty', ['deploy'], 'PASS', [], '4'],
  [`${longOwner}/${longName}`, ['a-very-long-execution-point-name-that-needs-to-wrap'], 'FAIL', mixedResults, '3'],
  [`<b>${markup}</b>/${markup}`, [markup], 'PASS', verifiedResults, '2'],
  ['gitlab.com/acme/elsewhere', ['deploy'], 'PASS', verifiedResults, '1'],
  ['acme/return-navigation', ['check'], 'PASS', scrollableResults, 'b'],
  [`${longOwner}/fact-strip`, ['check'], 'PASS', verifiedResults, 'c'],
].map(([repository, points, overall, results, digit], index) => ({
  repository: repository.includes('/') && repository.split('/').length === 2 ? `github.com/${repository}` : repository,
  points,
  overall,
  results,
  commit: sha(digit).replace(/^./, 'a'),
  minutesAgo: [5, 1, 90, 2000, 30, 0, 3, 45, 10, 25, 15][index],
}));

const now = Date.parse('2026-11-23T12:00:00Z');
const uuid = number => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;

function summarize(entry, id, receivedAt) {
  const count = status => entry.results.filter(item => item.status === status).length;
  return {
    id,
    received_at: new Date(receivedAt).toISOString(),
    sender: 'ci@example.com',
    repository: entry.repository,
    commit: entry.commit,
    execution_points: entry.points,
    overall: entry.overall,
    warn_count: count('WARN'),
    not_run_count: count('NOT_RUN'),
    result_count: entry.results.length,
  };
}

const history = [];
const details = new Map();
const total = 130;
for (let number = total; number >= 1; number -= 1) {
  const latestIndex = total - number;
  const entry = latestIndex < newest.length
    ? newest[latestIndex]
    : { ...newest[number % newest.length], minutesAgo: latestIndex * 20 };
  const summary = summarize(entry, uuid(number), now - entry.minutesAgo * 60_000);
  history.push(summary);
  details.set(summary.id, { ...summary, results: entry.results });
}

const latest = history.slice(0, newest.length);

const completedRuleSets = [{
  repository: latest.find(summary => summary.repository.includes(markup)).repository,
  sets: [{ source: ruleSource, path: 'sets/markup', id: 'markup', version: '1.0', name: `Publisher baseline ${markup}` }],
}, {
  repository: 'github.com/acme/return-navigation',
  sets: [
    { source: ruleSource, path: 'sets/baseline', id: 'baseline', version: '1.0', name: 'Repository baseline' },
    { source: ruleSource, path: 'sets/security', id: 'security', version: '2.0', name: 'Security and release readiness for shared repositories with additional compliance requirements' },
    { source: ruleSource, path: 'sets/licensing', id: 'licensing', version: '1.0', name: 'Licensing' },
  ],
}];

const [markupSet, baselineSet, securitySet, licensingSet] = completedRuleSets.flatMap(entry => entry.sets);
const sets = [
  { registration: markupSet, members: ['markup'] },
  {
    registration: baselineSet,
    members: ['license-file', 'design-review', 'rule-with-a-very-long-identifier-that-needs-to-wrap-on-narrow-screens'],
    description: 'Common repository checks and reviews.',
  },
  { registration: securitySet, members: ['license-file', 'no-secrets'] },
  { registration: licensingSet, members: ['license-file'] },
  { registration: { source: ruleSource, path: 'sets/unbound', id: 'unbound', version: '1.0', name: 'Unbound set' }, members: [] },
];
const setScan = { through: Date.UTC(2026, 10, 25) * 1000, registrations: sets.length + 1 };
const nonPassingRule = rules.find(([rule]) => rule.id === 'design-review').at(-1);
const failedBaseline = {
  repository: 'github.com/acme/failed-baseline',
  version: '0.9',
  registered: true,
  complete: false,
  non_passing_members: [{
    source: nonPassingRule.source, path: nonPassingRule.path, id: nonPassingRule.id, version: nonPassingRule.version, status: 'WARN',
  }],
};

function setVersion(registration, memberRules, description, knowledge) {
  return {
    ...registration,
    ...(description ? { description } : {}),
    ...(knowledge ? { knowledge } : {}),
    digest: `v1:sha256:${'d'.repeat(64)}`,
    commit: 'e'.repeat(40),
    registered_at: '2026-11-24T12:00:00Z',
    members: memberRules.map(({ source, path, id, version, digest }) => ({
      source, path, id, version, digest, enabled: !id.startsWith('rule-with-a-very-long-identifier'),
    })),
  };
}

const setHistories = sets.map(({ registration, members, description }) => {
  const memberRules = members.map(id => rules.find(([rule]) => rule.id === id).at(-1));
  if (registration.id === 'baseline') return [
    setVersion({ ...registration, version: failedBaseline.version, name: 'Original repository baseline' },
      [nonPassingRule], 'Early baseline for shared reviews.', { purpose: 'Establish the first review checks.', future: { ignored: true } }),
    setVersion(registration, memberRules, description, {
      purpose: 'Establish a common standard for repository maintenance.',
      audience: 'Repositories maintained by more than one team.',
      commonality: 'These rules protect shared maintenance work.',
      rules: [
        { rule: 'license-file', role: 'Keep the license visible at the repository root.' },
        { rule: 'design-review', role: 'Record the reason for design decisions.' },
      ],
      admission: ['Applies across languages and build systems.', 'Reports an actionable result.'],
      execution_points: 'Run in CI so each repository reports its current state.',
      references: [`https://example.test/standards/${'long-reference-'.repeat(12)}`],
    }),
  ];
  if (registration.id === 'markup') return [
    setVersion(registration, memberRules, `Registered description ${markup}`, {
      purpose: `Registered purpose ${markup}`,
      rules: [{ rule: 'markup', role: `Registered role ${markup}` }],
    }),
  ];
  return [setVersion(registration, memberRules, description)];
});

const fixtureBindings = [baselineSet, securitySet, markupSet,
  { source: ruleSource, path: 'sets/missing', id: 'unregistered-set', version: '1.0' },
].map(({ source, path, id, version }) => ({ source, path, id, version, execution_points: ['deploy'] }));
details.get(history[0].id).rule_sets = fixtureBindings;
details.get(history[1].id).rule_sets = [];

const ruleVersionKey = ({ source, path, id, version }) => JSON.stringify([source, path, id, version]);
const memberships = new Map();
for (const { source, path, id, version, name, members } of setHistories.flat()) {
  for (const member of members) {
    const key = ruleVersionKey(member);
    memberships.set(key, [...(memberships.get(key) ?? []), { source, path, id, version, name: name || id }]);
  }
}
for (const version of rules.flat()) {
  version.rule_sets = memberships.get(ruleVersionKey(version)) ?? [];
}

const scan = {
  through: Math.max(...rules.flat().map(version => Date.parse(version.registered_at))) * 1000,
  registrations: rules.flat().length,
};

// The fixture names use ASCII, so lowercased strings compare in ledger order.
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const displayName = rule => (rule.name ?? rule.id).toLowerCase();
const setSummaries = sets
  .map(({ registration, members, description }) => ({
    ...registration, member_count: members.length, scan: setScan, ...(description ? { description } : {}),
  }))
  .sort((a, b) => compare(displayName(a), displayName(b)));
const ruleSummaries = rules
  .map(versions => versions.at(-1))
  .map(({ source, path, id, version, kind, name, description, owner }) => ({
    source, path, id, version, kind, scan,
    rule_sets: sets.filter(set => source === ruleSource && set.members.includes(id))
      .map(set => set.registration).sort((a, b) => compare(a.path, b.path)),
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(owner === undefined ? {} : { owner }),
  }))
  .sort((a, b) => compare(displayName(a), displayName(b))
    || compare(a.source, b.source) || compare(a.path, b.path) || compare(a.id, b.id));

const json = (status, body) => ({ status, body });
const code = (status, value) => json(status, { code: value });

function limitFrom(params) {
  if (!params.has('limit')) return 100;
  const limit = Number(params.get('limit'));
  return Number.isInteger(limit) && limit >= 1 && limit <= 200 ? limit : undefined;
}

function attestations(params) {
  const limit = limitFrom(params);
  const before = params.get('before');
  const repository = params.get('repository');
  const allowed = ['limit', 'before', 'repository', 'preview'];
  if (limit === undefined || repository === '' || repository?.includes('\0') ||
      (before !== null && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(before)) ||
      [...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) {
    return code(400, 'invalid_query');
  }
  const page = history.filter(summary => (before === null || summary.id < before)
    && (repository === null || summary.repository === repository));
  return json(200, page.slice(0, limit));
}

const releaseRepository = 'github.com/acme/return-navigation';
const releaseFacts = [
  release(releaseRepository, '2.0', 1, 'PASS', [baselineSet, securitySet]),
  release(releaseRepository, '1.11', 8, 'ERROR'),
  release(releaseRepository, '1.9', 10, 'PASS'),
  release('github.com/acme/missing-evidence', '1.0', 2, null),
  release('github.com/acme/failing-evidence', '1.0', 3, 'FAIL'),
  release('github.com/acme/evidence-error', '1.0', 4, 'ERROR'),
  release(`github.com/${longOwner}/${longName}`, '1.0', 6, 'FAIL', [securitySet]),
  release(completedRuleSets[0].repository, `release-${markup}-${'v'.repeat(190)}`, 5, 'PASS', [markupSet], 'api_key'),
  release('github.com/acme/gadget', '1.0', 7, 'PASS'),
  ...Array.from({ length: 103 }, (_, index) =>
    release(`github.com/acme/project-${String(index + 1).padStart(3, '0')}`, '1.0', 20 + index, 'PASS')),
].sort((a, b) => compare(b.received_at, a.received_at)
  || compare(b.repository, a.repository) || compare(b.version, a.version));
const latestReleases = [...new Set(releaseFacts.map(fact => fact.repository))]
  .map(repository => releaseFacts.find(fact => fact.repository === repository));

function release(repository, version, minutesAgo, overall, completed_rule_sets = [], auth_method = 'github_oidc') {
  return {
    repository, version, commit: sha('c').slice(0, -2) + minutesAgo.toString(16).padStart(2, '0'),
    sender: 'ci@example.com', auth_method,
    received_at: new Date(now - minutesAgo * 60_000).toISOString(),
    evidence: overall === null ? null : { overall, completed_rule_sets },
  };
}

function releaseDetail(params) {
  const repository = params.get('repository');
  const version = params.get('version');
  if (params.size !== 2 || !repository || !version) return code(400, 'invalid_query');
  const fact = releaseFacts.find(candidate => candidate.repository === repository && candidate.version === version);
  if (!fact) return code(404, 'release_not_found');
  if (fact.evidence === null) return json(200, fact);
  const { overall, completed_rule_sets } = fact.evidence;
  const complete = completed_rule_sets.map(set => ({ ...set, registered: true, complete: true, non_passing_members: [] }));
  const incomplete = overall === 'PASS' ? [] : [{
    ...baselineSet, registered: true, complete: false,
    non_passing_members: [{
      source: nonPassingRule.source, path: nonPassingRule.path, id: nonPassingRule.id,
      version: nonPassingRule.version, status: overall,
    }],
  }];
  return json(200, {
    ...fact,
    evidence: {
      id: history[0].id, overall, received_at: fact.received_at, sender: fact.sender, auth_method: fact.auth_method,
      rule_sets: [...complete, ...incomplete],
    },
  });
}

function releasePage(params, latestOnly) {
  const limit = limitFrom(params);
  const repository = params.get('repository');
  const allowed = latestOnly ? ['limit', 'before'] : ['limit', 'before', 'repository'];
  if (limit === undefined || (!latestOnly && !repository) ||
      [...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) {
    return code(400, 'invalid_query');
  }
  const history = latestOnly ? releaseFacts : releaseFacts.filter(fact => fact.repository === repository);
  const page = latestOnly ? latestReleases : history;
  const before = params.get('before');
  if (before === null) return json(200, page.slice(0, limit));
  try {
    const cursor = JSON.parse(before);
    const index = history.findIndex(fact => fact.repository === cursor.repository && fact.version === cursor.version);
    if (index === -1 || Object.keys(cursor).length !== 2) return code(400, 'invalid_query');
    const older = new Set(history.slice(index + 1));
    return json(200, page.filter(fact => older.has(fact)).slice(0, limit));
  } catch {
    return code(400, 'invalid_query');
  }
}

const deployOwner = 'github.com/acme/infrastructure';
const deploymentFixtures = [
  { name: 'production', fact: latestReleases[0] },
  { name: 'production', fact: latestReleases[1] },
  { name: 'production', fact: latestReleases[2] },
  { name: 'production', fact: latestReleases[3] },
  { name: 'staging', fact: latestReleases[0], commitOnly: true },
  { name: 'staging', fact: { repository: 'github.com/acme/pending', commit: sha('a'), evidence: null }, commitOnly: true },
  { name: 'production', owner: 'github.com/acme/other-infrastructure', fact: latestReleases[0] },
  { name: 'staging', fact: latestReleases[2], unrecorded: 'v3.0' },
  { name: 'p'.repeat(64), owner: `github.com/${longOwner}/${longName}`, fact: latestReleases[5] },
  { name: 'demo', owner: markup, fact: latestReleases[4] },
  { name: 'rollback', fact: releaseFacts.find(fact => fact.repository === releaseRepository && fact.version === '1.11') },
  { name: 'canary', fact: { ...latestReleases[0], commit: '9'.repeat(40), evidence: null }, commitOnly: true },
  { name: 'p'.repeat(64), owner: `github.com/${longOwner}/${longName}`, fact: latestReleases[0], unrecorded: '3.0' },
  ...Array.from({ length: 102 }, (_, index) => ({
    name: `test-${String(index + 1).padStart(3, '0')}`, fact: latestReleases[0],
  })),
];
const currentDeployments = deploymentFixtures.map(({
  name, owner = deployOwner, fact, commitOnly, unrecorded,
}, index) => ({
  id: String(deploymentFixtures.length - index),
  target: { owner, name },
  repository: fact.repository,
  version: commitOnly ? null : unrecorded ?? fact.version,
  reported_commit: commitOnly ? fact.commit : null,
  commit: unrecorded ? null : fact.commit,
  sender: owner,
  auth_method: owner === markup ? 'api_key' : 'github_oidc',
  received_at: new Date(now - index * 60_000).toISOString(),
  state: unrecorded ? 'release_not_recorded' : fact.evidence ? 'evidence' : 'no_evidence',
  evidence: unrecorded ? null : fact.evidence,
}));

function deploymentPage(params) {
  const limit = limitFrom(params);
  const repository = params.get('repository');
  const before = params.get('before');
  const allowed = ['limit', 'before', 'repository'];
  if (limit === undefined || repository === '' || repository?.includes('\0') ||
      [...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) {
    return code(400, 'invalid_query');
  }
  const entries = currentDeployments.filter(entry => repository === null || entry.repository === repository);
  const index = before === null ? -1 : entries.findIndex(entry => entry.id === before);
  if (before !== null && index === -1) return code(400, 'invalid_query');
  return json(200, entries.slice(index + 1, index + 1 + limit));
}

function registryList(params, summaries, scan) {
  const limit = limitFrom(params);
  if (limit === undefined) return code(400, 'invalid_query');
  const before = params.get('before');
  let start = 0;
  if (before !== null) {
    try {
      const cursor = JSON.parse(before);
      const { source, path, id, version, scan: bound } = cursor;
      if (Object.keys(cursor).length !== 5 || !bound || Object.keys(bound).length !== 2
          || bound.through !== scan.through || bound.registrations !== scan.registrations) {
        return code(400, 'invalid_query');
      }
      const index = summaries.findIndex(item =>
        item.source === source && item.path === path && item.id === id && item.version === version);
      if (index === -1) return code(400, 'invalid_query');
      start = index + 1;
    } catch {
      return code(400, 'invalid_query');
    }
  }
  return json(200, summaries.slice(start, start + limit));
}

function setCompliance(params) {
  const [source, path, id] = ['source', 'path', 'id'].map(name => params.get(name));
  if (params.size !== 3 || !source || !path || !id) return code(400, 'invalid_query');
  const bindings = completedRuleSets.flatMap(({ repository, sets }) => sets
    .filter(set => set.source === source && set.path === path && set.id === id)
    .map(({ version }) => ({ repository, version, registered: true, complete: true, non_passing_members: [] })));
  if (source === baselineSet.source && path === baselineSet.path && id === baselineSet.id) bindings.push(failedBaseline);
  return json(200, bindings.sort((a, b) => compare(a.repository, b.repository)));
}

const overviewNow = Date.now();
const syncTime = new Date(overviewNow - 5 * 60_000).toISOString();
const oldestSync = new Date(overviewNow - 25 * 60_000).toISOString();
const archivedRepository = 'github.com/acme/archived';
const repositoryFixtures = [
  ['github.com/acme/return-navigation', 'current', 'PASS'],
  ['github.com/acme/widget', 'overdue', 'PASS', 1],
  ['github.com/acme/overdue-final', 'overdue', 'PASS', 4],
  ['github.com/acme/pending', 'pending', 'PASS'],
  ['github.com/acme/no-records', 'never_integrated'],
  ['github.com/acme/never-synced', 'unknown'],
  ['github.com/acme/stale-sync', 'unknown', 'PASS'],
  ['gitlab.com/acme/elsewhere', 'unknown', 'PASS'],
  ['github.com/acme/gadget', 'current', 'ERROR'],
  [latest.find(summary => summary.repository.startsWith('github.com/' + longOwner)).repository, 'current', 'FAIL'],
  [completedRuleSets[0].repository, 'current', 'PASS'],
  [archivedRepository, 'current', 'PASS'],
];

function repositoryEntry([repository, state, overall, step], index) {
  const managed = !repository.startsWith('gitlab.com/');
  const heartbeat_completed_at = repository.endsWith('/stale-sync')
    ? new Date(overviewNow - 2 * 86_400_000).toISOString()
    : repository.endsWith('/never-synced') || !managed ? null
    : state === 'pending' ? oldestSync : syncTime;
  const waiting = state === 'pending' || state === 'overdue';
  const minutesWaiting = state === 'pending' ? 10 : step === 4 ? 8 * 24 * 60 : 150;
  const observedAt = new Date(overviewNow - minutesWaiting * 60_000).toISOString();
  const report = latest.find(summary => summary.repository === repository &&
    summary.execution_points.includes('check'));
  const check = overall ? {
    id: report?.id ?? uuid(total + index + 1),
    commit: report?.commit ?? sha('f'),
    overall,
    received_at: report?.received_at ?? new Date(overviewNow - (minutesWaiting + 15) * 60_000).toISOString(),
  } : null;
  const release = latestReleases.find(fact => fact.repository === repository);
  const deployment = currentDeployments.find(fact => fact.repository === repository);
  return {
    repository, managed, platform: managed ? 'github' : null, state, heartbeat_completed_at,
    status_token: {
      current: 'status-passed', pending: 'status-allowed', overdue: 'status-warning',
      never_integrated: 'status-failed', unknown: 'status-not-run',
    }[state],
    latest_check: check,
    head: heartbeat_completed_at ? {
      branch: 'main', commit: waiting ? sha('a') : check?.commit ?? sha('b'),
      observed_at: observedAt, committed_at: observedAt, direct_evidence: !!check && !waiting,
    } : null,
    pending_since: waiting ? observedAt : null,
    pending_age_seconds: waiting ? minutesWaiting * 60 : null,
    overdue_step: step ?? null, overdue_steps: step ? 4 : null,
    observed_heads_since_evidence: state === 'overdue' ? 2 : state === 'current' ? 0 : 1,
    last_evidence_at: check?.received_at ?? null,
    latest_release: release ? { version: release.version, commit: release.commit, received_at: release.received_at } : null,
    latest_deployment: deployment ? { ...deployment.target, received_at: deployment.received_at } : null,
  };
}

const repositoryOverview = {
  heartbeat: {
    completed_at: new Date(overviewNow - 2 * 86_400_000).toISOString(),
    stale: true,
  },
  repositories: repositoryFixtures.map(repositoryEntry).filter(entry => entry.repository !== archivedRepository)
    .sort((a, b) => a.repository < b.repository ? -1 : 1),
};

function ruleDetail(params) {
  const [source, path, id] = ['source', 'path', 'id'].map(name => params.get(name));
  if (source === null || path === null || id === null) return code(400, 'invalid_rule_identity');
  const versions = rules.find(candidate => candidate[0].source === source && candidate[0].path === path && candidate[0].id === id);
  return versions ? json(200, versions) : code(404, 'rule_not_found');
}

/** Answers a read API request path with the status and JSON body of the fixture, or undefined for other paths. */
export function respond(target) {
  const url = new URL(target, 'http://preview.invalid');
  const { pathname, searchParams } = url;
  if (pathname === '/v0/repositories/overview') {
    if (searchParams.get('preview') === 'stat-tiles') {
      return json(200, {
        ...repositoryOverview,
        repositories: repositoryOverview.repositories.filter(entry => entry.repository !== 'github.com/acme/widget'),
      });
    }
    const response = json(200, repositoryOverview);
    return searchParams.get('preview') === 'slow-refresh' ? { ...response, delay: 750 } : response;
  }
  if (pathname === '/v0/attestations/latest' || pathname === '/v0/attestations') {
    const response = pathname.endsWith('/latest') ? json(200, latest) : attestations(searchParams);
    // Keep the initial loading and busy refresh states visible for browser review.
    return searchParams.get('preview') === 'slow-refresh' ? { ...response, delay: 750 } : response;
  }
  if (pathname === '/v0/releases/latest' || pathname === '/v0/releases') {
    return releasePage(searchParams, pathname.endsWith('/latest'));
  }
  if (pathname === '/v0/releases/detail') return releaseDetail(searchParams);
  if (pathname === '/v0/deployments') return deploymentPage(searchParams);
  if (pathname === '/v0/rules') return registryList(searchParams, ruleSummaries, scan);
  if (pathname === '/v0/rule-sets') return registryList(searchParams, setSummaries, setScan);
  if (pathname === '/v0/rule-sets/detail') {
    const [source, path, id] = ['source', 'path', 'id'].map(name => searchParams.get(name));
    if (searchParams.size !== 3 || !source || !path || !id) return code(400, 'invalid_rule_set_identity');
    const versions = setHistories.find(([set]) => set.source === source && set.path === path && set.id === id);
    return versions ? json(200, versions) : code(404, 'rule_set_not_found');
  }
  if (pathname === '/v0/rule-sets/compliance') return setCompliance(searchParams);
  if (pathname === '/v0/repositories/completed-rule-sets') return json(200, completedRuleSets);
  if (pathname === '/v0/rules/detail') return ruleDetail(searchParams);
  const detail = /^\/v0\/attestations\/([^/]+)$/.exec(pathname);
  if (detail) {
    const found = details.get(decodeURIComponent(detail[1]));
    return found ? json(200, found) : code(404, 'attestation_not_found');
  }
  return pathname.startsWith('/v0') ? code(404, 'route_not_found') : undefined;
}

export const fixtureTargets = {
  latest: '/v0/attestations/latest',
  repositoryOverview: '/v0/repositories/overview',
  completedRuleSets: '/v0/repositories/completed-rule-sets',
  history: '/v0/attestations',
  releases: '/v0/releases/latest',
  deployments: '/v0/deployments',
  releaseHistory: `/v0/releases?${new URLSearchParams({ repository: releaseRepository })}`,
  releaseDetails: releaseFacts.map(({ repository, version }) =>
    `/v0/releases/detail?${new URLSearchParams({ repository, version })}`),
  rules: '/v0/rules',
  ruleSets: '/v0/rule-sets',
  ruleSetDetails: setSummaries.map(({ source, path, id }) =>
    `/v0/rule-sets/detail?${new URLSearchParams({ source, path, id })}`),
  ruleSetCompliance: setSummaries.map(({ source, path, id }) =>
    `/v0/rule-sets/compliance?${new URLSearchParams({ source, path, id })}`),
  details: [...details.keys()].map(id => `/v0/attestations/${id}`),
  ruleDetails: rules.map(([first]) => `/v0/rules/detail?${new URLSearchParams({ source: first.source, path: first.path, id: first.id })}`),
};
