import type { RepositoryOverviewEntry } from './api/client';
import type { IconName } from './components/icons';

export type RepositoryHealth = 'passed' | 'warning' | 'failed' | 'not-run';

export function repositoryHealth(entry: RepositoryOverviewEntry): RepositoryHealth {
  if (entry.state === 'unknown') return 'not-run';
  if (entry.state === 'never_integrated' || entry.latest_check?.overall === 'FAIL' ||
      entry.latest_check?.overall === 'ERROR') return 'failed';
  if (entry.state === 'overdue') {
    return entry.overdue_step === entry.overdue_steps ? 'failed' : 'warning';
  }
  return 'passed';
}

export const healthStatuses = {
  failed: { outcome: 'FAIL', icon: 'cross', rank: 0 },
  warning: { outcome: 'WARN', icon: 'warning', rank: 1 },
  'not-run': { outcome: 'NOT_RUN', icon: 'circle', rank: 2 },
  passed: { outcome: 'PASS', icon: 'check', rank: 3 },
} satisfies Record<RepositoryHealth, { outcome: string; icon: IconName; rank: number }>;

export const stateLabels = {
  current: 'Current',
  pending: 'Pending',
  overdue: 'Overdue',
  never_integrated: 'Never integrated',
  unknown: 'Unknown',
} satisfies Record<RepositoryOverviewEntry['state'], string>;

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, character => character.codePointAt(0)!);
  const rightPoints = Array.from(right, character => character.codePointAt(0)!);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index++) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

export function compareText(left: string, right: string): number {
  // Lower-case code points ignore case without a locale, so ordering stays deterministic across browsers.
  return compareCodePoints(left.toLowerCase(), right.toLowerCase()) || compareCodePoints(left, right);
}

export function compareByName(left: RepositoryOverviewEntry, right: RepositoryOverviewEntry): number {
  return compareText(left.repository, right.repository) || compareText(left.platform ?? '', right.platform ?? '');
}

export function compareBySeverity(left: RepositoryOverviewEntry, right: RepositoryOverviewEntry): number {
  return healthStatuses[repositoryHealth(left)].rank - healthStatuses[repositoryHealth(right)].rank ||
    compareByName(left, right);
}
