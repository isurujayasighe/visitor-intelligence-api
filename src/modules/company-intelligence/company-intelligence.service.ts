import type { CompanyConfidence } from '@prisma/client';
import { findMatchingCompanyMapping } from './cidr-match.service';
import { cleanCompanyName, namesLookSimilar } from './company-guess.service';
import { classifyNetwork } from './network-classifier.service';
import type { CompanyEvidence, CompanyIntelligenceInput, CompanyIntelligenceResult } from './company-intelligence.types';

function confidenceFromMapping(value: string): CompanyConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'high';
}

function evidence(signals: CompanyEvidence['signals'], decision: string): CompanyEvidence {
  return { signals, decision };
}

export class CompanyIntelligenceService {
  identifyCompany(input: CompanyIntelligenceInput): CompanyIntelligenceResult {
    const networkName = cleanCompanyName(input.asName || input.rdapEntity || input.rdapName);
    const mapping = findMatchingCompanyMapping(input.ip, input.mappings);

    if (mapping) {
      return {
        networkName,
        companyGuess: mapping.companyName,
        companyDomain: mapping.companyDomain,
        companyConfidence: confidenceFromMapping(mapping.confidence),
        companyReason: 'IP matched manually configured company IP range',
        networkType: 'corporate',
        isLeadNetwork: true,
        companySource: 'manual_mapping',
        matchedCompanyMappingId: mapping.id,
        matchedNetworkRuleId: null,
        companyEvidence: evidence([
          { type: 'manual_ip_mapping', value: mapping.ipRange, confidence: mapping.confidence },
          ...(networkName ? [{ type: 'asn', value: networkName }] : []),
        ], 'manual mapping matched before ASN/RDAP evaluation'),
      };
    }

    const classification = classifyNetwork([
      input.asName,
      input.asDomain,
      input.reverseDns,
      input.rdapName,
      input.rdapEntity,
    ], input.networkRules);

    if (!classification.isLeadNetwork) {
      return {
        networkName,
        companyGuess: 'Unknown',
        companyDomain: input.asDomain || null,
        companyConfidence: 'low',
        companyReason: 'ISP/mobile/cloud/proxy network detected',
        networkType: classification.networkType,
        isLeadNetwork: false,
        companySource: 'network_filter',
        matchedNetworkRuleId: classification.matchedRuleId,
        matchedCompanyMappingId: null,
        companyEvidence: evidence([
          ...(networkName ? [{ type: 'asn', value: networkName }] : []),
          ...(classification.reason ? [{ type: 'network_classifier', value: classification.reason }] : []),
        ], `marked as non-lead ${classification.networkType} network`),
      };
    }

    const reverseDns = input.reverseDns || '';
    if (input.asDomain && reverseDns.toLowerCase().includes(input.asDomain.toLowerCase()) && networkName) {
      return this.leadResult({
        networkName,
        companyGuess: networkName,
        companyDomain: input.asDomain,
        confidence: 'high',
        source: 'reverse_dns',
        reason: 'Reverse DNS indicates company-owned network',
        signals: [{ type: 'reverse_dns', value: reverseDns }, { type: 'asn_domain', value: input.asDomain }],
      });
    }

    if (namesLookSimilar(input.rdapName || input.rdapEntity, input.asName) && networkName) {
      return this.leadResult({
        networkName,
        companyGuess: networkName,
        companyDomain: input.asDomain,
        confidence: 'high',
        source: 'rdap_asn',
        reason: 'RDAP and ASN organization agree',
        signals: [
          { type: 'rdap_name', value: input.rdapName || '' },
          { type: 'rdap_entity', value: input.rdapEntity || '' },
          { type: 'asn', value: input.asName || '' },
        ].filter((signal) => signal.value),
      });
    }

    if (cleanCompanyName(input.asName)) {
      return this.leadResult({
        networkName,
        companyGuess: cleanCompanyName(input.asName)!,
        companyDomain: input.asDomain,
        confidence: 'medium',
        source: 'asn',
        reason: 'ASN organization used as company guess',
        signals: [{ type: 'asn', value: input.asName! }],
      });
    }

    const rdapCompany = cleanCompanyName(input.rdapEntity || input.rdapName);
    if (rdapCompany) {
      return this.leadResult({
        networkName,
        companyGuess: rdapCompany,
        companyDomain: input.asDomain,
        confidence: 'medium',
        source: 'rdap',
        reason: 'RDAP organization used as company guess',
        signals: [{ type: 'rdap', value: rdapCompany }],
      });
    }

    return {
      networkName,
      companyGuess: 'Unknown',
      companyDomain: input.asDomain || null,
      companyConfidence: 'low',
      companyReason: 'No company-owned network signals found',
      networkType: 'unknown',
      isLeadNetwork: false,
      companySource: 'unknown',
      matchedCompanyMappingId: null,
      matchedNetworkRuleId: null,
      companyEvidence: evidence([], 'no reliable company signal found'),
    };
  }

  private leadResult(input: {
    networkName?: string | null;
    companyGuess: string;
    companyDomain?: string | null;
    confidence: CompanyConfidence;
    source: string;
    reason: string;
    signals: CompanyEvidence['signals'];
  }): CompanyIntelligenceResult {
    return {
      networkName: input.networkName,
      companyGuess: input.companyGuess,
      companyDomain: input.companyDomain || null,
      companyConfidence: input.confidence,
      companyReason: input.reason,
      networkType: 'corporate',
      isLeadNetwork: true,
      companySource: input.source,
      matchedCompanyMappingId: null,
      matchedNetworkRuleId: null,
      companyEvidence: evidence(input.signals, input.reason),
    };
  }
}
