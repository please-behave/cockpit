export function respond(target: string): { status: number; body: unknown; delay?: number } | undefined;

export const fixtureTargets: {
  latest: string;
  completedRuleSets: string;
  history: string;
  releases: string;
  deployments: string;
  releaseHistory: string;
  releaseDetails: string[];
  rules: string;
  ruleSets: string;
  ruleSetDetails: string[];
  ruleSetCompliance: string[];
  details: string[];
  ruleDetails: string[];
};
