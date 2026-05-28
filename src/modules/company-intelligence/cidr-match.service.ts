import net from 'node:net';
import type { CompanyIntelligenceMapping } from './company-intelligence.types';

function ipv4ToNumber(ip: string): number | null {
  if (net.isIP(ip) !== 4) return null;
  return ip.split('.').reduce((total, part) => (total << 8) + Number(part), 0) >>> 0;
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    const normalizedCidr = cidr.includes('/') ? cidr : `${cidr}/32`;
    const [rangeIp, prefixRaw] = normalizedCidr.split('/');
    const prefix = Number(prefixRaw);
    const ipNumber = ipv4ToNumber(ip);
    const rangeNumber = ipv4ToNumber(rangeIp);

    if (ipNumber === null || rangeNumber === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return false;
    }

    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNumber & mask) === (rangeNumber & mask);
  } catch {
    return false;
  }
}

export function findMatchingCompanyMapping(ip: string, mappings: CompanyIntelligenceMapping[]) {
  return mappings.find((mapping) => isIpInCidr(ip, mapping.ipRange)) || null;
}
