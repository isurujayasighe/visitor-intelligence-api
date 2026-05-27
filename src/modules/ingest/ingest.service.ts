import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../config/env';
import { createIpHash } from '../ip-intelligence/ip-hash';
import { extractPublicIp } from '../ip-intelligence/ip-normalizer';
import type { IpIntelligenceService } from '../ip-intelligence/ip-intelligence.service';
import { normalizePageData, type PageGroupRuleLike } from '../page-intelligence/page-normalizer.service';
import type { IngestVisitorEventBody } from './ingest.schema';

type Dependencies = {
  config: AppConfig;
  prisma: PrismaClient;
  ipIntelligenceService: IpIntelligenceService;
};

export type IngestContext = {
  forwardedFor?: string | string[];
  remoteIp?: string;
};

function valueOrNull(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function headerValue(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) {
    return value.join(',');
  }

  return value;
}

export class IngestService {
  constructor(private readonly deps: Dependencies) {}

  async ingest(body: IngestVisitorEventBody, context: IngestContext) {
    const rawIp =
      body.ip_address ||
      headerValue(context.forwardedFor) ||
      context.remoteIp ||
      '';

    const ip = extractPublicIp(rawIp);

    if (!ip) {
      const error = new Error('Invalid IP address') as Error & { statusCode: number; receivedIp?: string };
      error.statusCode = 400;
      error.receivedIp = String(rawIp);
      throw error;
    }

    const ipHash = createIpHash(ip, this.deps.config.ipHashSecret);
    const intelligence = await this.deps.ipIntelligenceService.getOrCreate(ip);
    const pageGroupRules = await this.loadPageGroupRules();
    const normalizedPage = normalizePageData({
      pageUrl: body.page_url,
      pageHostname: body.page_hostname,
      pagePath: body.page_path,
      pageTitle: body.page_title,
      referrer: body.referrer,
    }, pageGroupRules);

    const event = await this.deps.prisma.visitorEvent.create({
      data: {
        eventName: body.event_name,
        clientId: valueOrNull(body.client_id),

        pageUrl: valueOrNull(body.page_url),
        pageHostname: valueOrNull(body.page_hostname),
        pagePath: valueOrNull(body.page_path),
        pageTitle: valueOrNull(body.page_title),
        normalizedPageUrl: normalizedPage.normalizedPageUrl,
        normalizedPageHostname: normalizedPage.normalizedPageHostname,
        normalizedPagePath: normalizedPage.normalizedPagePath,
        pageGroup: normalizedPage.pageGroup,
        pageGroupSource: normalizedPage.pageGroupSource,
        pageSlug: normalizedPage.pageSlug,

        userAgent: valueOrNull(body.user_agent),
        referrer: valueOrNull(body.referrer),

        utmSource: valueOrNull(body.utm_source),
        utmMedium: valueOrNull(body.utm_medium),
        utmCampaign: valueOrNull(body.utm_campaign),

        ipHash,
        ipAddress: this.deps.config.storeRawIp ? ip : null,

        country: intelligence.country,
        countryCode: intelligence.countryCode,
        region: intelligence.region,
        city: intelligence.city,
        asn: intelligence.asn,
        networkName: intelligence.networkName,
        companyGuess: intelligence.companyGuess,
        companyConfidence: intelligence.companyConfidence,

        ipIntelligenceId: intelligence.id,
        rawPayload: body,
      },
    });

    return {
      event,
      intelligence,
      ip,
    };
  }

  private async loadPageGroupRules(): Promise<PageGroupRuleLike[]> {
    try {
      return await this.deps.prisma.pageGroupRule.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          priority: 'asc',
        },
        select: {
          name: true,
          matchType: true,
          pattern: true,
          groupName: true,
          priority: true,
        },
      });
    } catch {
      return [];
    }
  }
}
