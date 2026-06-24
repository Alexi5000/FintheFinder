export type ModelUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type RunUsage = {
  modelCalls: ModelUsage[];
  exaSearches: number;
};

export type PricingSnapshot = {
  effectiveDate: string;
  models: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
  exaSearchUnitUsd: number;
};

export const defaultPricingSnapshot: PricingSnapshot = {
  effectiveDate: '2026-06-24',
  models: {
    'gpt-5.5': { inputPerMillion: 5, outputPerMillion: 15 },
    'gpt-5.4-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
    unknown: { inputPerMillion: 5, outputPerMillion: 15 },
  },
  exaSearchUnitUsd: 0.005,
};

export function estimateRunCost(usage: RunUsage, pricing: PricingSnapshot = defaultPricingSnapshot) {
  const modelCost = usage.modelCalls.reduce((total, call) => {
    const modelPricing = pricing.models[call.model] ?? pricing.models.unknown;
    return total + (call.inputTokens / 1_000_000) * modelPricing.inputPerMillion + (call.outputTokens / 1_000_000) * modelPricing.outputPerMillion;
  }, 0);
  const searchCost = usage.exaSearches * pricing.exaSearchUnitUsd;
  const total = modelCost + searchCost;

  return {
    modelCostUsd: roundUsd(modelCost),
    searchCostUsd: roundUsd(searchCost),
    totalUsd: roundUsd(total),
    pricingEffectiveDate: pricing.effectiveDate,
  };
}

export function isBudgetExceeded(usage: RunUsage, budgetUsd: number, pricing: PricingSnapshot = defaultPricingSnapshot) {
  return estimateRunCost(usage, pricing).totalUsd > budgetUsd;
}

function roundUsd(value: number) {
  return Math.round(value * 100_000) / 100_000;
}
