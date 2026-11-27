import { expect, test } from 'vitest';
import type { Deployment, ReleaseSummary, Summary } from './api/client';
import {
  attestationActivity, deploymentActivity, mergeActivity, releaseActivity, type ActivityEntry,
} from './activity';

const entry = (kind: ActivityEntry['kind'], key: string, receivedAt: string): ActivityEntry =>
  ({ kind, key, repository: 'github.com/acme/widget', receivedAt, fact: key });

// Verifies REQ-0019.
test('maps each kind to its key fact', () => {
  const attestation = { id: 'a1', repository: 'github.com/acme/a', received_at: '2026-11-23T11:00:00Z', overall: 'FAIL' } as Summary;
  const release = { repository: 'github.com/acme/r', version: '1.2', received_at: '2026-11-23T11:01:00Z' } as ReleaseSummary;
  const deployment = {
    id: '7', repository: 'github.com/acme/d', received_at: '2026-11-23T11:02:00Z', target: { owner: 'o', name: 'production' },
  } as Deployment;
  expect(attestationActivity(attestation)).toEqual({
    kind: 'attestation', key: 'a1', repository: 'github.com/acme/a', receivedAt: '2026-11-23T11:00:00Z', fact: 'Verdict FAIL',
  });
  expect(releaseActivity(release)).toMatchObject({ kind: 'release', repository: 'github.com/acme/r', fact: 'Version 1.2' });
  expect(deploymentActivity(deployment)).toEqual({
    kind: 'deployment', key: '7', repository: 'github.com/acme/d', receivedAt: '2026-11-23T11:02:00Z', fact: 'Target production',
  });
});

test('orders by receipt time, newest first, across kinds', () => {
  const merged = mergeActivity([
    entry('release', 'b', '2026-11-23T10:00:00Z'),
    entry('deployment', 'c', '2026-11-23T12:00:00Z'),
    entry('attestation', 'a', '2026-11-23T11:00:00Z'),
  ]);
  expect(merged.map(item => item.key)).toEqual(['c', 'a', 'b']);
});

test('compares instants and not timestamp text', () => {
  const merged = mergeActivity([
    entry('attestation', 'earlier', '2026-11-23T10:00:00Z'),
    entry('attestation', 'later', '2026-11-23T10:00:00.5Z'),
  ]);
  expect(merged.map(item => item.key)).toEqual(['later', 'earlier']);
});

test('breaks ties by kind and then by key', () => {
  const at = '2026-11-23T10:00:00Z';
  const merged = mergeActivity([
    entry('deployment', '1', at), entry('release', 'z', at), entry('attestation', 'b', at),
    entry('release', 'a', at), entry('attestation', 'a', at),
  ]);
  expect(merged.map(item => `${item.kind}:${item.key}`)).toEqual([
    'attestation:a', 'attestation:b', 'release:a', 'release:z', 'deployment:1',
  ]);
});

test('keeps the ten newest entries, an empty feed and does not modify its input', () => {
  const input = Array.from({ length: 12 }, (_, index) =>
    entry('attestation', String(index), `2026-11-23T10:${String(index).padStart(2, '0')}:00Z`));
  const snapshot = [...input];
  const merged = mergeActivity(input);
  expect(merged).toHaveLength(10);
  expect(merged[0].key).toBe('11');
  expect(merged.at(-1)!.key).toBe('2');
  expect(input).toEqual(snapshot);
  expect(mergeActivity([])).toEqual([]);
});
