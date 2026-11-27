import { html, type HTMLTemplateResult } from 'lit';
import type { Attestation } from '../api/client';
import './pb-tooltip';

type Result = Attestation['results'][number];
type Unverified = Extract<Result['verification'], { status: 'unverified' }>;

export const overallExplanations = {
  PASS: 'The run reported overall success. Advisory warnings can still be present.',
  FAIL: 'The run reported a blocking failure, so it did not pass.',
  ERROR: 'An error or an incomplete required result prevented the run from passing.',
} satisfies Record<Attestation['overall'], string>;

export const kindExplanations = {
  check: 'A check runs a command and determines the outcome from its exit status.',
  review: 'An AI reviewer evaluates the supplied evidence against a prompt. Its verdict is probabilistic.',
  integrity: 'An integrity result reports whether the conditions needed for trustworthy run evidence held.',
} satisfies Record<Result['kind'], string>;

export const statusExplanations = {
  PASS: 'The rule ran and reported success.',
  FAIL: 'The rule ran and reported that its requirements were not met.',
  ERROR: 'A problem prevented the rule from reaching a verdict.',
  WARN: 'The rule reported an advisory problem that did not block overall success.',
  NOT_RUN: 'The rule did not complete, so no verdict is available.',
} satisfies Record<Result['status'], string>;

export const verificationExplanations = {
  verified: 'The reported rule identity and version match a ledger registration, and their digests are equal.',
  unregistered: 'The ledger could not verify the rule. Its identity, version or digest was missing, or no matching version was registered.',
  mismatch: 'The ledger could not verify the rule. The identity and version match a registration, but the reported and registered digests differ.',
} satisfies Record<Exclude<Result['verification']['status'], 'unverified'> | Unverified['reason'], string>;

export const blockingExplanations = {
  Blocking: 'A failure or error from this review prevents the build from passing.',
  'Non-blocking': 'A failure or error from this review is advisory and does not prevent the build from passing.',
} satisfies Record<'Blocking' | 'Non-blocking', string>;

export function explainValue(chip: HTMLTemplateResult, explanations: Record<string, string>, value: string) {
  if (!Object.hasOwn(explanations, value)) return chip;
  return html`<pb-tooltip value-chip .description=${explanations[value]}>${chip}</pb-tooltip>`;
}
