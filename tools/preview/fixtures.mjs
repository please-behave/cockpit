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
  rule('check', 'checks/security', 'no-secrets', ['1.0'], { name: 'No secrets in the repository' }),
  rule('review', 'reviews/design', 'design-review', ['1.0', '1.1', '1.2', '2.0'], {
    name: 'Design review',
    description: 'A reviewer judges whether the change fits the architecture.',
    prompt: 'Review the change for architectural fit.\nName every module that it touches and judge the dependency direction.',
    blocking: true,
    knowledge: { purpose: 'Keep the architecture coherent.', limitations: ['Only as good as the reviewer.'] },
  }),
  rule('review', 'reviews/docs', 'docs-review', ['1.0'], { prompt: 'Is every public change documented?', blocking: false }),
  rule('check', 'checks/long', 'rule-with-a-very-long-identifier-that-needs-to-wrap-on-narrow-screens', ['1.0'], {
    name: `Rule with a very long name: ${longText}`,
    description: longText,
  }),
  rule('review', 'reviews/long', 'long-review', ['1.0', '1.1'], {
    name: 'Review with long texts',
    description: longText,
    prompt: `${longText}\n${markup}`,
    blocking: false,
    knowledge: {
      purpose: longText,
      conditions: [{ statement: longText, rationale: longText }, { statement: 'Allow conditions without a reason.' }],
      future_field: { text: markup },
    },
  }),
  rule('check', 'checks/markup', 'markup', ['1.0'], {
    name: `<b>${markup}</b>`,
    description: `<script>alert(1)</script> ${markup}`,
    knowledge: {
      purpose: markup,
      conditions: [{ statement: '<b>bold</b>', rationale: markup }],
      references: [`<a href="javascript:alert(1)">${markup}</a>`],
    },
  }),
];

function rule(kind, path, id, versions, details) {
  return versions.map((version, index) => ({
    source: ruleSource,
    path,
    id,
    version,
    kind,
    ...details,
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

const mixedResults = [
  result('run-1', 'check', 'FAIL', identity('checks/license', 'license-file', '2.0')),
  result('run-2', 'check', 'WARN', identity('checks/security', 'no-secrets', '1.0')),
  result('run-3', 'review', 'NOT_RUN', identity('reviews/design', 'design-review', '2.0')),
  result('run-4', 'review', 'PASS', identity('reviews/docs', 'docs-review', '1.0')),
  result('run-5', 'check', 'PASS', identity('checks/license', 'license-file', '1.0'), { status: 'unverified', reason: 'mismatch' }),
  result('run-6', 'check', 'PASS', { source: ruleSource, path: 'checks/unknown', id: 'unregistered-rule' }, { status: 'unverified', reason: 'unregistered' }),
  result('run-7', 'integrity', 'PASS', undefined, { status: 'unverified', reason: 'unregistered' }),
  result('run-8', 'check', 'PASS', identity('checks/long', 'rule-with-a-very-long-identifier-that-needs-to-wrap-on-narrow-screens', '1.0')),
  result('run-9', 'check', 'PASS', identity('checks/markup', 'markup', '1.0')),
];

const errorResults = [
  result('run-1', 'check', 'ERROR', identity('checks/security', 'no-secrets', '1.0')),
  result('run-2', 'review', 'NOT_RUN', identity('reviews/design', 'design-review', '2.0')),
];

const scrollableResults = Array.from({ length: 36 }, (_, index) => ({
  ...verifiedResults[index % verifiedResults.length],
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
].map(([repository, points, overall, results, digit], index) => ({
  repository: repository.includes('/') && repository.split('/').length === 2 ? `github.com/${repository}` : repository,
  points,
  overall,
  results,
  commit: sha(digit).replace(/^./, 'a'),
  minutesAgo: [5, 1, 90, 2000, 30, 0, 3, 45, 10, 25][index],
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

const ruleSummaries = rules
  .map(versions => versions.at(-1))
  .map(({ source, path, id, version, kind, name, description }) => ({
    source, path, id, version, kind,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  }))
  .sort((a, b) => `${a.source}\n${a.path}\n${a.id}`.localeCompare(`${b.source}\n${b.path}\n${b.id}`));

const json = (status, body) => ({ status, body });
const code = (status, value) => json(status, { code: value });

function limitFrom(params) {
  if (!params.has('limit')) return 100;
  const limit = Number(params.get('limit'));
  return Number.isInteger(limit) && limit >= 1 && limit <= 200 ? limit : undefined;
}

function attestations(params) {
  const limit = limitFrom(params);
  if (limit === undefined) return code(400, 'invalid_query');
  const before = params.get('before');
  const page = before === null ? history : history.filter(summary => summary.id < before);
  return json(200, page.slice(0, limit));
}

function ruleList(params) {
  const limit = limitFrom(params);
  if (limit === undefined) return code(400, 'invalid_query');
  const before = params.get('before');
  let start = 0;
  if (before !== null) {
    try {
      const { source, path, id } = JSON.parse(before);
      start = ruleSummaries.findIndex(item => item.source === source && item.path === path && item.id === id) + 1;
    } catch {
      return code(400, 'invalid_query');
    }
  }
  return json(200, ruleSummaries.slice(start, start + limit));
}

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
  if (pathname === '/v0/attestations/latest') return json(200, latest);
  if (pathname === '/v0/attestations') return attestations(searchParams);
  if (pathname === '/v0/rules') return ruleList(searchParams);
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
  history: '/v0/attestations',
  rules: '/v0/rules',
  details: [...details.keys()].map(id => `/v0/attestations/${id}`),
  ruleDetails: rules.map(([first]) => `/v0/rules/detail?${new URLSearchParams({ source: first.source, path: first.path, id: first.id })}`),
};
