import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../config/env';
import { requireApiKey } from '../../shared/auth';
import { parseDateRange } from '../../shared/date-range';
import { normalizePageData, type PageGroupRuleLike } from '../page-intelligence/page-normalizer.service';

type Options = {
  config: AppConfig;
  prisma: PrismaClient;
};

const DateRangeQuerySchema = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
});

const DEFAULT_PAGE_GROUP_RULES = [
  { name: 'Services section', matchType: 'path_prefix', pattern: '/services', groupName: 'Services', priority: 10 },
  { name: 'Products section', matchType: 'path_prefix', pattern: '/products', groupName: 'Products', priority: 20 },
  { name: 'Solutions section', matchType: 'path_prefix', pattern: '/solutions', groupName: 'Solutions', priority: 30 },
  { name: 'Blog section', matchType: 'path_prefix', pattern: '/blog', groupName: 'Blog', priority: 40 },
  { name: 'Case studies section', matchType: 'path_prefix', pattern: '/case-studies', groupName: 'Case Studies', priority: 50 },
  { name: 'Contact section', matchType: 'path_prefix', pattern: '/contact', groupName: 'Contact', priority: 60 },
  { name: 'Careers section', matchType: 'path_prefix', pattern: '/careers', groupName: 'Careers', priority: 70 },
  { name: 'About section', matchType: 'path_prefix', pattern: '/about', groupName: 'About', priority: 80 },
];

function commonWhere(from: Date, to: Date) {
  return {
    occurredAt: {
      gte: from,
      lte: to,
    },
  };
}

function parsePositiveInt(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), maximum));
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

async function loadPageGroupRules(prisma: PrismaClient): Promise<PageGroupRuleLike[]> {
  try {
    return await prisma.pageGroupRule.findMany({
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

async function seedDefaultPageGroupRules(prisma: PrismaClient): Promise<void> {
  const existingCount = await prisma.pageGroupRule.count();

  if (existingCount > 0) {
    return;
  }

  await prisma.pageGroupRule.createMany({
    data: DEFAULT_PAGE_GROUP_RULES.map((rule) => ({
      ...rule,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}

export async function registerDashboardRoutes(app: FastifyInstance, options: Options): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url.startsWith('/api/v1/dashboard')) {
      requireApiKey(request, options.config.dashboardApiKey);
    }
  });

  app.get('/api/v1/dashboard/summary', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get dashboard summary metrics',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: DateRangeQuerySchema,
    },
  }, async (request) => {
    const { from, to } = parseDateRange(request.query as any);

    const where = commonWhere(from, to);

    const [
      totalEvents,
      uniqueCompanies,
      countries,
      lowConfidence,
      mediumConfidence,
      highConfidence,
    ] = await Promise.all([
      options.prisma.visitorEvent.count({ where }),
      options.prisma.visitorEvent.groupBy({
        by: ['companyGuess'],
        where: {
          ...where,
          companyGuess: {
            not: null,
          },
        },
      }),
      options.prisma.visitorEvent.groupBy({
        by: ['countryCode'],
        where: {
          ...where,
          countryCode: {
            not: null,
          },
        },
      }),
      options.prisma.visitorEvent.count({
        where: {
          ...where,
          companyConfidence: 'low',
        },
      }),
      options.prisma.visitorEvent.count({
        where: {
          ...where,
          companyConfidence: 'medium',
        },
      }),
      options.prisma.visitorEvent.count({
        where: {
          ...where,
          companyConfidence: 'high',
        },
      }),
    ]);

    return {
      from,
      to,
      total_events: totalEvents,
      unique_company_guesses: uniqueCompanies.length,
      countries: countries.length,
      confidence: {
        low: lowConfidence,
        medium: mediumConfidence,
        high: highConfidence,
      },
    };
  });

  app.get('/api/v1/dashboard/top-companies', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get top company guesses',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const limit = Number(query.limit || 25);

    const rows = await options.prisma.visitorEvent.groupBy({
      by: ['companyGuess', 'companyConfidence', 'networkName', 'asn', 'country', 'city'],
      where: {
        ...commonWhere(from, to),
        companyGuess: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    return rows.map((row) => ({
      company_guess: row.companyGuess,
      company_confidence: row.companyConfidence,
      network_name: row.networkName,
      asn: row.asn,
      country: row.country,
      city: row.city,
      visits: row._count._all,
    }));
  });

  app.get('/api/v1/dashboard/top-pages', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get top visited pages',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const limit = Number(query.limit || 25);

    const rows = await options.prisma.visitorEvent.groupBy({
      by: ['normalizedPageHostname', 'normalizedPagePath', 'pageHostname', 'pagePath', 'pageTitle'],
      where: commonWhere(from, to),
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    return rows.map((row) => ({
      page_hostname: row.normalizedPageHostname || row.pageHostname,
      page_path: row.normalizedPagePath || row.pagePath,
      page_title: row.pageTitle,
      visits: row._count._all,
    }));
  });

  app.get('/api/v1/dashboard/visited-pages-grouped', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get visited pages grouped by business section',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          excludeUnknown: Type.Optional(Type.Union([Type.Boolean(), Type.String()])),
          limitGroups: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
          limitPagesPerGroup: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const excludeUnknown = parseBoolean(query.excludeUnknown);
    const limitGroups = parsePositiveInt(query.limitGroups, 25, 100);
    const limitPagesPerGroup = parsePositiveInt(query.limitPagesPerGroup, 20, 100);
    const rules = await loadPageGroupRules(options.prisma);

    const rows = await options.prisma.visitorEvent.findMany({
      where: commonWhere(from, to),
      select: {
        occurredAt: true,
        pageUrl: true,
        pageHostname: true,
        pagePath: true,
        pageTitle: true,
        referrer: true,
        normalizedPageUrl: true,
        normalizedPageHostname: true,
        normalizedPagePath: true,
        pageGroup: true,
        pageGroupSource: true,
        pageSlug: true,
        companyGuess: true,
        companyConfidence: true,
      },
    });

    type PageAggregate = {
      page_title: string | null;
      page_path: string;
      page_url: string | null;
      visits: number;
      companyGuesses: Set<string>;
      high_confidence_visits: number;
      last_visited_at: Date;
    };
    type GroupAggregate = {
      group_name: string;
      visits: number;
      companyGuesses: Set<string>;
      high_confidence_visits: number;
      last_visited_at: Date;
      pages: Map<string, PageAggregate>;
    };

    const groups = new Map<string, GroupAggregate>();

    rows.forEach((row) => {
      const normalized = row.normalizedPagePath && row.pageGroup
        ? {
            normalizedPageUrl: row.normalizedPageUrl,
            normalizedPageHostname: row.normalizedPageHostname,
            normalizedPagePath: row.normalizedPagePath,
            pageGroup: row.pageGroup,
            pageGroupSource: row.pageGroupSource || 'stored',
            pageSlug: row.pageSlug,
            pageTitle: row.pageTitle,
          }
        : normalizePageData({
            pageUrl: row.pageUrl,
            pageHostname: row.pageHostname,
            pagePath: row.pagePath,
            pageTitle: row.pageTitle,
            referrer: row.referrer,
          }, rules);

      const groupName = normalized.pageGroup || 'Unknown';

      if (excludeUnknown && groupName === 'Unknown') {
        return;
      }

      const pagePath = normalized.normalizedPagePath || row.pagePath || 'Unknown';
      const pageUrl = normalized.normalizedPageUrl || row.pageUrl;
      const pageKey = normalized.pageSlug || pagePath || pageUrl || row.pageTitle || 'unknown';

      if (!groups.has(groupName)) {
        groups.set(groupName, {
          group_name: groupName,
          visits: 0,
          companyGuesses: new Set<string>(),
          high_confidence_visits: 0,
          last_visited_at: row.occurredAt,
          pages: new Map<string, PageAggregate>(),
        });
      }

      const group = groups.get(groupName)!;
      group.visits += 1;
      if (row.companyGuess) group.companyGuesses.add(row.companyGuess);
      if (row.companyConfidence === 'high') group.high_confidence_visits += 1;
      if (row.occurredAt > group.last_visited_at) group.last_visited_at = row.occurredAt;

      if (!group.pages.has(pageKey)) {
        group.pages.set(pageKey, {
          page_title: normalized.pageTitle || row.pageTitle,
          page_path: pagePath,
          page_url: pageUrl,
          visits: 0,
          companyGuesses: new Set<string>(),
          high_confidence_visits: 0,
          last_visited_at: row.occurredAt,
        });
      }

      const page = group.pages.get(pageKey)!;
      page.visits += 1;
      if (row.companyGuess) page.companyGuesses.add(row.companyGuess);
      if (row.companyConfidence === 'high') page.high_confidence_visits += 1;
      if (row.occurredAt > page.last_visited_at) page.last_visited_at = row.occurredAt;
    });

    return Array.from(groups.values())
      .sort((left, right) => right.visits - left.visits)
      .slice(0, limitGroups)
      .map((group) => ({
        group_name: group.group_name,
        visits: group.visits,
        unique_company_guesses: group.companyGuesses.size,
        high_confidence_visits: group.high_confidence_visits,
        last_visited_at: group.last_visited_at,
        pages: Array.from(group.pages.values())
          .sort((left, right) => right.visits - left.visits)
          .slice(0, limitPagesPerGroup)
          .map((page) => ({
            page_title: page.page_title,
            page_path: page.page_path,
            page_url: page.page_url,
            visits: page.visits,
            unique_company_guesses: page.companyGuesses.size,
            high_confidence_visits: page.high_confidence_visits,
            last_visited_at: page.last_visited_at,
          })),
      }));
  });

  app.get('/api/v1/dashboard/page-group-rules', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get page grouping rules',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    },
  }, async () => {
    await seedDefaultPageGroupRules(options.prisma);
    const rows = await options.prisma.pageGroupRule.findMany({
      orderBy: [
        { isActive: 'desc' },
        { priority: 'asc' },
      ],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      match_type: row.matchType,
      pattern: row.pattern,
      group_name: row.groupName,
      priority: row.priority,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }));
  });

  app.get('/api/v1/dashboard/recent-visits', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get recent visitor events',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
      }),
    },
  }, async (request) => {
    const query = request.query as any;
    const limit = Number(query.limit || 50);

    const rows = await options.prisma.visitorEvent.findMany({
      orderBy: {
        occurredAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        occurredAt: true,
        eventName: true,
        ipAddress: true,
        pageUrl: true,
        pageTitle: true,
        referrer: true,
        country: true,
        region: true,
        city: true,
        asn: true,
        networkName: true,
        companyGuess: true,
        companyConfidence: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      occurred_at: row.occurredAt,
      event_name: row.eventName,
      ip_address: row.ipAddress,
      page_url: row.pageUrl,
      page_title: row.pageTitle,
      referrer: row.referrer,
      country: row.country,
      region: row.region,
      city: row.city,
      asn: row.asn,
      network_name: row.networkName,
      company_guess: row.companyGuess,
      company_confidence: row.companyConfidence,
      utm_source: row.utmSource,
      utm_medium: row.utmMedium,
      utm_campaign: row.utmCampaign,
    }));
  });

  app.get('/api/v1/dashboard/ip-intelligence', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get recent IP intelligence records',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Object({
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
      }),
    },
  }, async (request) => {
    const query = request.query as any;
    const limit = Number(query.limit || 100);

    const rows = await options.prisma.ipIntelligence.findMany({
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        country: true,
        countryCode: true,
        region: true,
        city: true,
        asn: true,
        asName: true,
        asDomain: true,
        reverseDns: true,
        networkName: true,
        companyGuess: true,
        companyDomain: true,
        companyConfidence: true,
        companyReason: true,
        lastLookupAt: true,
        updatedAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      country: row.country,
      country_code: row.countryCode,
      region: row.region,
      city: row.city,
      asn: row.asn,
      as_name: row.asName,
      as_domain: row.asDomain,
      reverse_dns: row.reverseDns,
      network_name: row.networkName,
      company_guess: row.companyGuess,
      company_domain: row.companyDomain,
      company_confidence: row.companyConfidence,
      company_reason: row.companyReason,
      last_lookup_at: row.lastLookupAt,
      updated_at: row.updatedAt,
    }));
  });
}
