import type { RepositoryOverviewEntry } from './api/client';

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
  failed: { label: 'failed', icon: '×', rank: 0 },
  warning: { label: 'warning', icon: '▲', rank: 1 },
  'not-run': { label: 'unknown', icon: '○', rank: 2 },
  passed: { label: 'passed', icon: '✓', rank: 3 },
} satisfies Record<RepositoryHealth, { label: string; icon: string; rank: number }>;

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

function compareText(left: string, right: string): number {
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
