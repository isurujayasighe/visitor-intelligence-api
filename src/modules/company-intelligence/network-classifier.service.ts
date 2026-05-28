import type { NetworkClassifierRuleLike } from './company-intelligence.types';

export type NetworkClassification = {
  networkType: string;
  isLeadNetwork: boolean;
  matchedRuleId: string | null;
  reason: string | null;
};

export function classifyNetwork(values: Array<string | null | undefined>, rules: NetworkClassifierRuleLike[]): NetworkClassification {
  const haystack = values.filter(Boolean).join(' ').toLowerCase();

  if (!haystack) {
    return { networkType: 'unknown', isLeadNetwork: false, matchedRuleId: null, reason: null };
  }

  const sortedRules = [...rules].sort((left, right) => left.priority - right.priority);

  for (const rule of sortedRules) {
    const pattern = rule.pattern.toLowerCase();
    let matched = false;

    if (rule.matchType === 'regex') {
      try {
        matched = new RegExp(rule.pattern, 'i').test(haystack);
      } catch {
        matched = false;
      }
    } else {
      matched = haystack.includes(pattern);
    }

    if (matched) {
      return {
        networkType: rule.networkType,
        isLeadNetwork: rule.isLeadNetwork,
        matchedRuleId: rule.id,
        reason: `${rule.name} matched`,
      };
    }
  }

  return { networkType: 'corporate', isLeadNetwork: true, matchedRuleId: null, reason: null };
}
