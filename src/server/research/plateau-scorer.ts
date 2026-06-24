export type PlateauInput = {
  iteration: number;
  supportedClaims: number;
  previousSupportedClaims: number;
  openCriticalGaps: number;
  uniqueDomains: number;
  contradictionCount: number;
  citationCoverage: number;
  budgetRemainingUsd: number;
};

export type PlateauDecision = {
  shouldContinue: boolean;
  score: number;
  reasons: string[];
};

export function scoreResearchPlateau(input: PlateauInput): PlateauDecision {
  const claimGrowth = Math.max(0, input.supportedClaims - input.previousSupportedClaims);
  const reasons: string[] = [];
  let score = 0;

  if (input.openCriticalGaps > 0) {
    score += 4;
    reasons.push('critical_gaps_open');
  }
  if (claimGrowth >= 2) {
    score += 3;
    reasons.push('high_claim_growth');
  }
  if (input.uniqueDomains < 3) {
    score += 2;
    reasons.push('source_diversity_low');
  }
  if (input.citationCoverage < 0.95) {
    score += 2;
    reasons.push('citation_coverage_low');
  }
  if (input.contradictionCount > 0) {
    score += 1;
    reasons.push('contradictions_need_resolution');
  }
  if (input.budgetRemainingUsd <= 0) {
    reasons.push('budget_exhausted');
    return { shouldContinue: false, score, reasons };
  }
  if (input.iteration < 2 && input.supportedClaims < 3) {
    score += 2;
    reasons.push('minimum_research_floor_not_met');
  }
  if (claimGrowth === 0 && input.iteration >= 2) {
    reasons.push('marginal_gain_plateau');
  }

  return {
    shouldContinue: score >= 3,
    score,
    reasons: reasons.length ? reasons : ['sufficient_coverage'],
  };
}
