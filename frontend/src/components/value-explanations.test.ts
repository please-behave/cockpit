import { expect, test } from 'vitest';
import attestationSchema from '../../../why/contracts/browser/attestation.schema.json';
import {
  blockingExplanations, kindExplanations, overallExplanations, statusExplanations, verificationExplanations,
} from './value-explanations';

const result = attestationSchema.properties.results.items.properties;
const verificationValues = result.verification.oneOf.flatMap(({ properties }) =>
  properties.reason?.enum ?? [properties.status.const],
);

// Verifies REQ-0010 and REQ-0024 against the browser read contract.
test.each([
  ['overall', attestationSchema.$defs.summary.properties.overall.enum, overallExplanations],
  ['kind', result.kind.enum, kindExplanations],
  ['result status', result.status.enum, statusExplanations],
  ['verification', verificationValues, verificationExplanations],
  ['blocking', ['Blocking', 'Non-blocking'], blockingExplanations],
] as const)('has explanation text for every %s value', (_group, values, explanations) => {
  expect(Object.keys(explanations).sort()).toEqual([...values].sort());
  for (const text of Object.values(explanations)) expect(text.trim()).not.toBe('');
});

test('explains the effect of both blocking values on the build', () => {
  expect(blockingExplanations).toEqual({
    Blocking: 'A failure or error from this review prevents the build from passing.',
    'Non-blocking': 'A failure or error from this review is advisory and does not prevent the build from passing.',
  });
});
