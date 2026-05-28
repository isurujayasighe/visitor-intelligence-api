import type { CompanyConfidence } from '@prisma/client';

export type CompanyIntelligenceMapping = {
  id: string;
  companyName: string;
  companyDomain: string | null;
  ipRange: string;
  source: string;
  confidence: string;
};

export type NetworkClassifierRuleLike = {
  id: string;
  name: string;
  pattern: string;
  matchType: string;
  networkType: string;
  isLeadNetwork: boolean;
  priority: number;
};

export type CompanyIntelligenceInput = {
  ip: string;
  asName?: string | null;
  asDomain?: string | null;
  reverseDns?: string | null;
  rdapName?: string | null;
  rdapEntity?: string | null;
  mappings: CompanyIntelligenceMapping[];
  networkRules: NetworkClassifierRuleLike[];
};

export type CompanyEvidence = {
  signals: Array<{ type: string; value: string; confidence?: string }>;
  decision: string;
};

export type CompanyIntelligenceResult = {
  networkName?: string | null;
  companyGuess: string;
  companyDomain?: string | null;
  companyConfidence: CompanyConfidence;
  companyReason: string;
  networkType: string;
  isLeadNetwork: boolean;
  companySource: string;
  companyEvidence: CompanyEvidence;
  matchedCompanyMappingId?: string | null;
  matchedNetworkRuleId?: string | null;
};
