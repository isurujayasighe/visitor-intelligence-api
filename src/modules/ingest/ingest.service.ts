import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../config/env';
import { createIpHash } from '../ip-intelligence/ip-hash';
import { extractPublicIp } from '../ip-intelligence/ip-normalizer';
import type { IpIntelligenceService } from '../ip-intelligence/ip-intelligence.service';
import { normalizePageData, type PageGroupRuleLike } from '../page-intelligence/page-normalizer.service';
import { normalizeAndGroupUrl, type GroupedUrl, type UrlGroupRuleLike } from '../url-grouping/url-normalizer.service';
import { VisitorIdentityService } from '../user-analytics/visitor-identity.service';
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

function parseEventTimestamp(value?: string): Date {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function buildSessionKey(input: { sessionId?: string | null; clientId?: string | null; ipHash: string; occurredAt: Date }) {
  const clientPart = input.clientId || 'anonymous';

  if (input.sessionId) {
    return `${input.ipHash}:${clientPart}:${input.sessionId}`;
  }

  const bucket = Math.floor(input.occurredAt.getTime() / (30 * 60 * 1000));
  return `${input.ipHash}:${clientPart}:${bucket}`;
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
    const urlGroupRules = await this.loadUrlGroupRules();
    const occurredAt = parseEventTimestamp(body.event_timestamp);
    const clientId = valueOrNull(body.client_id);
    const sessionId = valueOrNull(body.session_id);
    const normalizedPage = normalizePageData({
      pageUrl: body.page_url,
      pageHostname: body.page_hostname,
      pagePath: body.page_path,
      pageTitle: body.page_title,
      referrer: body.referrer,
    }, pageGroupRules);
    const groupedUrl = normalizeAndGroupUrl({
      pageUrl: body.page_url,
      pagePath: body.page_path,
      referrer: body.referrer,
    }, urlGroupRules);
    const session = await this.upsertVisitSession({
      sessionKey: buildSessionKey({ sessionId, clientId, ipHash, occurredAt }),
      clientId,
      ipHash,
      ipAddress: this.deps.config.storeRawIp ? ip : null,
      country: intelligence.country,
      countryCode: intelligence.countryCode,
      userAgent: valueOrNull(body.user_agent),
      occurredAt,
      groupedUrl,
    });
    const visitor = await new VisitorIdentityService(this.deps.prisma).upsertAnonymousVisitor({
      clientId,
      ipHash,
      userAgent: valueOrNull(body.user_agent),
      occurredAt,
      country: intelligence.country,
      countryCode: intelligence.countryCode,
      pageUrl: valueOrNull(body.page_url) || normalizedPage.normalizedPageUrl || valueOrNull(body.referrer),
      utmSource: valueOrNull(body.utm_source),
      utmMedium: valueOrNull(body.utm_medium),
      utmCampaign: valueOrNull(body.utm_campaign),
      visitSessionId: session.id,
    });

    const event = await this.deps.prisma.visitorEvent.create({
      data: {
        occurredAt,
        eventName: body.event_name,
        clientId,

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
        visitSessionId: session.id,
        visitorId: visitor.id,
        rawPayload: body,
      },
    });

    return {
      event,
      intelligence,
      ip,
      session,
      visitor,
    };
  }

  private async upsertVisitSession(input: {
    sessionKey: string;
    clientId: string | null;
    ipHash: string;
    ipAddress: string | null;
    country: string | null;
    countryCode: string | null;
    userAgent: string | null;
    occurredAt: Date;
    groupedUrl: GroupedUrl;
  }) {
    const existing = await this.deps.prisma.visitSession.findUnique({
      where: {
        sessionKey: input.sessionKey,
      },
    });

    if (!existing) {
      return this.deps.prisma.visitSession.create({
        data: {
          sessionKey: input.sessionKey,
          clientId: input.clientId,
          ipHash: input.ipHash,
          ipAddress: input.ipAddress,
          country: input.country,
          countryCode: input.countryCode,
          startedAt: input.occurredAt,
          endedAt: input.occurredAt,
          sessionDurationSeconds: 0,
          landedUrl: input.groupedUrl.originalUrl,
          landedUrlHostname: input.groupedUrl.hostname,
          landedUrlPath: input.groupedUrl.path,
          landedUrlGroup: input.groupedUrl.groupName,
          landedUrlGroupRuleId: input.groupedUrl.groupRuleId,
          exitUrl: input.groupedUrl.originalUrl,
          exitUrlHostname: input.groupedUrl.hostname,
          exitUrlPath: input.groupedUrl.path,
          exitUrlGroup: input.groupedUrl.groupName,
          exitUrlGroupRuleId: input.groupedUrl.groupRuleId,
          userAgent: input.userAgent,
        },
      });
    }

    const startedAt = input.occurredAt < existing.startedAt ? input.occurredAt : existing.startedAt;
    const previousEndedAt = existing.endedAt || existing.startedAt;
    const endedAt = input.occurredAt > previousEndedAt ? input.occurredAt : previousEndedAt;
    const shouldReplaceLanded = input.occurredAt < existing.startedAt || !existing.landedUrl;
    const shouldReplaceExit = input.occurredAt >= previousEndedAt;

    return this.deps.prisma.visitSession.update({
      where: {
        sessionKey: input.sessionKey,
      },
      data: {
        clientId: existing.clientId || input.clientId,
        ipAddress: existing.ipAddress || input.ipAddress,
        country: existing.country || input.country,
        countryCode: existing.countryCode || input.countryCode,
        userAgent: existing.userAgent || input.userAgent,
        startedAt,
        endedAt,
        sessionDurationSeconds: Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)),
        ...(shouldReplaceLanded ? {
          landedUrl: input.groupedUrl.originalUrl,
          landedUrlHostname: input.groupedUrl.hostname,
          landedUrlPath: input.groupedUrl.path,
          landedUrlGroup: input.groupedUrl.groupName,
          landedUrlGroupRuleId: input.groupedUrl.groupRuleId,
        } : {}),
        ...(shouldReplaceExit ? {
          exitUrl: input.groupedUrl.originalUrl,
          exitUrlHostname: input.groupedUrl.hostname,
          exitUrlPath: input.groupedUrl.path,
          exitUrlGroup: input.groupedUrl.groupName,
          exitUrlGroupRuleId: input.groupedUrl.groupRuleId,
        } : {}),
      },
    });
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

  private async loadUrlGroupRules(): Promise<UrlGroupRuleLike[]> {
    try {
      return await this.deps.prisma.urlGroupRule.findMany({
        where: {
          isActive: true,
        },
        orderBy: {
          priority: 'asc',
        },
        select: {
          id: true,
          name: true,
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
