export function respond(target: string): { status: number; body: unknown; delay?: number } | undefined;
export const statusPillLabels: readonly string[];

export const fixtureTargets: {
  latest: string;
  repositoryOverview: string;
  repositoryMap: string;
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
