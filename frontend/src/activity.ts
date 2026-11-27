import type { Deployment, ReleaseSummary, Summary } from './api/client';
import type { IconName } from './components/icons';

export type ActivityKind = 'attestation' | 'release' | 'deployment';

export interface ActivityEntry {
  kind: ActivityKind;
  key: string;
  repository: string;
  receivedAt: string;
  fact: string;
}

export const activityLimit = 10;

/** The kinds in tie-break order. */
export const activityKinds: readonly ActivityKind[] = ['attestation', 'release', 'deployment'];

export const activityKindLabels: Record<ActivityKind, { icon: IconName; label: string }> = {
  attestation: { icon: 'attestation', label: 'Attestation' },
  release: { icon: 'release', label: 'Release' },
  deployment: { icon: 'deployment', label: 'Deployment' },
};

export function attestationActivity({ id, repository, received_at, overall }: Summary): ActivityEntry {
  return { kind: 'attestation', key: id, repository, receivedAt: received_at, fact: `Verdict ${overall}` };
}

export function releaseActivity({ repository, version, received_at }: ReleaseSummary): ActivityEntry {
  return { kind: 'release', key: JSON.stringify([repository, version]), repository, receivedAt: received_at, fact: `Version ${version}` };
}

export function deploymentActivity({ id, repository, received_at, target }: Deployment): ActivityEntry {
  return { kind: 'deployment', key: id, repository, receivedAt: received_at, fact: `Target ${target.name}` };
}

function compare(left: ActivityEntry, right: ActivityEntry): number {
  const byKey = left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
  return Date.parse(right.receivedAt) - Date.parse(left.receivedAt)
    || activityKinds.indexOf(left.kind) - activityKinds.indexOf(right.kind)
    || byKey;
}

/** Orders entries by receipt time, newest first, then by kind and key, and keeps the newest ones. */
export function mergeActivity(entries: readonly ActivityEntry[], limit = activityLimit): ActivityEntry[] {
  return [...entries].sort(compare).slice(0, limit);
}
