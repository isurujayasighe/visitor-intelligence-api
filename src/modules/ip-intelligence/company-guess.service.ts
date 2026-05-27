import type { CompanyConfidence } from '@prisma/client';

export type CompanyGuessInput = {
  maxmindAsName?: string | null;
  ipinfoAsName?: string | null;
  asDomain?: string | null;
  reverseDns?: string | null;
  rdapName?: string | null;
  rdapEntity?: string | null;
};

export type CompanyGuessResult = {
  networkName?: string;
  companyGuess: string;
  companyDomain?: string;
  companyConfidence: CompanyConfidence;
  companyReason: string;
};

const weakNetworkKeywords = [
  'telecom',
  'communications',
  'broadband',
  'internet',
  'mobile',
  'cellular',
  'wireless',
  'fiber',
  'fibre',
  'isp',
  'dialog',
  'mobitel',
  'slt',
  'sri lanka telecom',
  'airtel',
  'hutch',
  'verizon',
  'comcast',
  'vodafone',
  'orange',
  'bt',
  'sky broadband',

  'amazon',
  'aws',
  'google cloud',
  'google llc',
  'microsoft',
  'azure',
  'cloudflare',
  'digitalocean',
  'linode',
  'akamai',
  'fastly',
  'hetzner',
  'ovh',
  'hosting',
  'data center',
  'datacenter',
  'vpn',
  'proxy',
  'tor',
];

function hasValue(value?: string | null): value is string {
  return Boolean(value && value.trim());
}

function contains(value: string, keyword: string): boolean {
  return value.toLowerCase().includes(keyword.toLowerCase());
}

function isWeakNetworkName(name: string): boolean {
  return weakNetworkKeywords.some((keyword) => contains(name, keyword));
}

export function guessCompany(input: CompanyGuessInput): CompanyGuessResult {
  const networkName =
    input.maxmindAsName?.trim() ||
    input.ipinfoAsName?.trim() ||
    input.rdapEntity?.trim() ||
    input.rdapName?.trim() ||
    '';

  const asDomain = input.asDomain?.trim() || undefined;
  const reverseDns = input.reverseDns?.trim() || '';

  if (!networkName) {
    return {
      companyGuess: 'Unknown',
      companyDomain: asDomain,
      companyConfidence: 'low',
      companyReason: 'No ASN/RDAP organization found',
    };
  }

  if (isWeakNetworkName(networkName)) {
    return {
      networkName,
      companyGuess: 'Unknown',
      companyDomain: asDomain,
      companyConfidence: 'low',
      companyReason: 'ISP/mobile/cloud/proxy network detected',
    };
  }

  if (hasValue(asDomain) && reverseDns && contains(reverseDns, asDomain)) {
    return {
      networkName,
      companyGuess: networkName,
      companyDomain: asDomain,
      companyConfidence: 'high',
      companyReason: 'ASN domain matched reverse DNS',
    };
  }

  if (hasValue(input.maxmindAsName)) {
    return {
      networkName,
      companyGuess: input.maxmindAsName,
      companyDomain: asDomain,
      companyConfidence: 'medium',
      companyReason: 'MaxMind ASN organization used as company guess',
    };
  }

  if (hasValue(input.ipinfoAsName)) {
    return {
      networkName,
      companyGuess: input.ipinfoAsName,
      companyDomain: asDomain,
      companyConfidence: 'medium',
      companyReason: 'IPinfo ASN organization used as company guess',
    };
  }

  return {
    networkName,
    companyGuess: networkName,
    companyDomain: asDomain,
    companyConfidence: 'medium',
    companyReason: 'RDAP organization used as company guess',
  };
}
