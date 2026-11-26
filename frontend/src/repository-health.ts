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
