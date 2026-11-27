import { reviewTargets } from './fixtures.mjs';

const tableRows = 'tbody > tr:has(td)';
const repositoryEntries = `.sets > li, .deployments > li, ${tableRows}`;

// Select the primary repeated entries in each view. Selectors also cover open shadow roots.
export const reviewCases = [
  ['Dashboard', '/', 'pb-dashboard', '.tiles > li', 'Repository tiles'],
  ['Attestations', '/attestations', 'pb-history', tableRows, 'Attestation rows'],
  ['Attestation detail', reviewTargets.attestation.slice(3), 'pb-attestation', tableRows, 'Rule result rows'],
  ['Releases', '/releases', 'pb-releases', tableRows, 'Release rows'],
  ['Repository', '/repositories/detail' + reviewTargets.repository, 'pb-repository', repositoryEntries,
    'Rule Set chips, deployment entries, release and attestation rows'],
  ['Repository (release history address)', '/releases/repository' + reviewTargets.repository, 'pb-repository',
    repositoryEntries, 'Rule Set chips, deployment entries, release and attestation rows'],
  ['Release detail', reviewTargets.release.slice(3), 'pb-release', '.rule-sets > li', 'Evidence Rule Sets'],
  ['Deployments', '/deployments', 'pb-deployments', '.deployments > li', 'Deployment entries'],
  ['Rules', '/rules', 'pb-rules', 'details > summary', 'Rule and Rule Set group summaries'],
  ['Rule detail', reviewTargets.rule.slice(3), 'pb-rule', 'article dl > div:has(> dt)', 'Version facts'],
  ['Rule Set detail', reviewTargets.ruleSet.slice(3), 'pb-rule-set', `${tableRows}, .repositories > li`,
    'Member rule rows and repository entries'],
  ['Sign in', '/sign-in', '.sign-in-card', '.sign-in-link', 'Sign-in action'],
  ['Repository map', '/preview/repository-map', 'pb-repository-map', 'li:has(> pb-repo-chip)', 'Repository chips'],
  ['Status pills', '/preview/status-pill', 'main', tableRows, 'Pairs of boxed and compact status pills'],
  ['Page not found', '/preview/unknown-page', 'pb-not-found', 'p', 'Message and return link'],
].map(([name, path, root, selector, entries]) => ({ name, path, root, selector, entries }));
