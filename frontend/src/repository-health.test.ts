import { expect, test } from 'vitest';
import { fixtureTargets, respond } from '../../tools/preview/fixtures.mjs';
import type { Overall, RepositoryOverview, RepositoryOverviewEntry } from './api/client';
import { repositoryHealth, stateLabels, type RepositoryHealth } from './repository-health';

const overview = respond(fixtureTargets.repositoryOverview)!.body as RepositoryOverview;
const entry = overview.repositories.find(repository => repository.repository.endsWith('/widget'))!;
const verdicts = ['PASS', 'FAIL', 'ERROR', null] as const satisfies readonly (Overall | null)[];

// Verifies REQ-0019. The expected health columns follow the verdict order above.
const healthCases = [
  ['unknown', null, 'not-run', 'not-run', 'not-run', 'not-run'],
  ['never_integrated', null, 'failed', 'failed', 'failed', 'failed'],
  ['current', null, 'passed', 'failed', 'failed', 'passed'],
  ['pending', null, 'passed', 'failed', 'failed', 'passed'],
  ['overdue', 3, 'warning', 'failed', 'failed', 'warning'],
  ['overdue', 4, 'failed', 'failed', 'failed', 'failed'],
] as const satisfies readonly [
  RepositoryOverviewEntry['state'], number | null,
  RepositoryHealth, RepositoryHealth, RepositoryHealth, RepositoryHealth,
][];

test.each(healthCases.flatMap(([state, step, ...health]) =>
  verdicts.map((verdict, index) => ({ state, step, verdict, expected: health[index] })),
))('maps $state at step $step with verdict $verdict to $expected', ({ state, step, verdict, expected }) => {
  expect(repositoryHealth({
    ...entry,
    state,
    overdue_step: step,
    overdue_steps: step === null ? null : 4,
    latest_check: verdict === null ? null : { ...entry.latest_check!, overall: verdict },
  })).toBe(expected);
});

test('labels every repository state', () => {
  expect(stateLabels).toEqual({
    unknown: 'Unknown',
    never_integrated: 'Never integrated',
    current: 'Current',
    pending: 'Pending',
    overdue: 'Overdue',
  });
});
