import { PrismaClient, IpIntelligence } from '@prisma/client';
import type { AppConfig } from '../../config/env';
import type { MaxMindService } from './maxmind.service';
import { createIpHash } from './ip-hash';
import { lookupReverseDns } from './reverse-dns.service';
import { lookupRdap } from './rdap.service';
import { lookupIpinfoLite } from './ipinfo.service';
import { CompanyIntelligenceService } from '../company-intelligence/company-intelligence.service';

type Dependencies = {
  config: AppConfig;
  prisma: PrismaClient;
  maxMind: MaxMindService;
};

export class IpIntelligenceService {
  constructor(private readonly deps: Dependencies) {}

  async getOrCreate(ip: string): Promise<IpIntelligence> {
    const { config, prisma } = this.deps;
    const ipHash = createIpHash(ip, config.ipHashSecret);

    const existing = await prisma.ipIntelligence.findUnique({
      where: { ipHash },
    });

    const cacheUntil = new Date(Date.now() - config.ipCacheTtlDays * 24 * 60 * 60 * 1000);

    if (existing && existing.lastLookupAt > cacheUntil) {
      return existing;
    }

    const maxmind = this.deps.maxMind.lookup(ip);
    const ipinfo = await lookupIpinfoLite(ip, config.ipinfoToken);
    const reverseDns = await lookupReverseDns(ip);
    const rdap = config.enableRdapLookup ? await lookupRdap(ip) : {};
    const [mappings, networkRules] = await Promise.all([
      prisma.companyIpMapping.findMany({
        where: { isActive: true },
        select: {
          id: true,
          companyName: true,
          companyDomain: true,
          ipRange: true,
          source: true,
          confidence: true,
        },
      }),
      prisma.networkClassifierRule.findMany({
        where: { isActive: true },
        orderBy: { priority: 'asc' },
        select: {
          id: true,
          name: true,
          pattern: true,
          matchType: true,
          networkType: true,
          isLeadNetwork: true,
          priority: true,
        },
      }),
    ]);

    const company = new CompanyIntelligenceService().identifyCompany({
      ip,
      asName: maxmind.asName || ipinfo.ipinfoAsName,
      asDomain: ipinfo.ipinfoAsDomain,
      reverseDns,
      rdapName: rdap.rdapName,
      rdapEntity: rdap.rdapEntity,
      mappings,
      networkRules,
    });

    const data = {
      ipHash,
      ipAddress: config.storeRawIp ? ip : null,

      country: maxmind.country || ipinfo.ipinfoCountry || null,
      countryCode: maxmind.countryCode || ipinfo.ipinfoCountryCode || null,
      region: maxmind.region || null,
      regionCode: maxmind.regionCode || null,
      city: maxmind.city || null,
      postalCode: maxmind.postalCode || null,
      latitude: maxmind.latitude || null,
      longitude: maxmind.longitude || null,
      accuracyRadius: maxmind.accuracyRadius || null,
      timezone: maxmind.timezone || null,

      asn: maxmind.asn || ipinfo.ipinfoAsn || null,
      asName: maxmind.asName || ipinfo.ipinfoAsName || null,
      asDomain: ipinfo.ipinfoAsDomain || null,
      asnNetwork: maxmind.asnNetwork || ipinfo.ipinfoNetwork || null,

      reverseDns,
      rdapName: rdap.rdapName || null,
      rdapEntity: rdap.rdapEntity || null,

      networkName: company.networkName || null,
      companyGuess: company.companyGuess,
      companyDomain: company.companyDomain || null,
      companyConfidence: company.companyConfidence,
      companyReason: company.companyReason,
      networkType: company.networkType,
      isLeadNetwork: company.isLeadNetwork,
      companySource: company.companySource,
      companyEvidence: company.companyEvidence,
      matchedCompanyMappingId: company.matchedCompanyMappingId || null,
      matchedNetworkRuleId: company.matchedNetworkRuleId || null,

      geoSource: maxmind.geoSource || null,
      asnSource: maxmind.asnSource || null,
      lookupSource: existing ? 'refresh' : 'live',
      lastLookupAt: new Date(),
    };

    return prisma.ipIntelligence.upsert({
      where: { ipHash },
      update: data,
      create: data,
    });
  }
}
