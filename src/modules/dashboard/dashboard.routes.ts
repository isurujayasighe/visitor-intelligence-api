import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../config/env';
import { requireApiKey } from '../../shared/auth';
import { parseDateRange } from '../../shared/date-range';
import { createIpHash } from '../ip-intelligence/ip-hash';
import { extractPublicIp } from '../ip-intelligence/ip-normalizer';
import { isIpInCidr } from '../company-intelligence/cidr-match.service';
import { normalizePageData, type PageGroupRuleLike } from '../page-intelligence/page-normalizer.service';

type Options = {
  config: AppConfig;
  prisma: PrismaClient;
};

const DateRangeQuerySchema = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
});

const PaginationQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, maximum: 10000 })),
  pageSize: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
});

const DEFAULT_PAGE_GROUP_RULES = [
  { name: 'Services section', matchType: 'path_prefix', pattern: '/services', groupName: 'Services', priority: 10 },
  { name: 'Products section', matchType: 'path_prefix', pattern: '/products', groupName: 'Products', priority: 20 },
  { name: 'Product section', matchType: 'path_prefix', pattern: '/product', groupName: 'Products', priority: 21 },
  { name: 'Solutions section', matchType: 'path_prefix', pattern: '/solutions', groupName: 'Solutions', priority: 30 },
  { name: 'Blog section', matchType: 'path_prefix', pattern: '/blog', groupName: 'Blog', priority: 40 },
  { name: 'Case studies section', matchType: 'path_prefix', pattern: '/case-studies', groupName: 'Case Studies', priority: 50 },
  { name: 'Contact section', matchType: 'path_prefix', pattern: '/contact', groupName: 'Contact', priority: 60 },
  { name: 'Careers section', matchType: 'path_prefix', pattern: '/careers', groupName: 'Careers', priority: 70 },
  { name: 'About section', matchType: 'path_prefix', pattern: '/about', groupName: 'About', priority: 80 },
];

const DEFAULT_URL_GROUP_RULES = [
  {
    name: 'Core services URLs',
    description: 'Core service page paths',
    pattern: '^/services/(ifs|ifs-applications|integration|implementation|support|managed-services|application-managed-support|managed-support|outlook-integration|work-orders|scheduling).*$',
    groupName: 'Core services',
    priority: 10,
  },
  {
    name: 'Advisory services URLs',
    description: 'Advisory and consulting page paths',
    pattern: '^/services/(business-strategy|business-strategy-assignment|advisory|consulting|digital-transformation|erp-advisory).*$',
    groupName: 'Advisory services',
    priority: 20,
  },
  {
    name: 'Products URLs',
    description: 'Product page paths',
    pattern: '^/products?/.*$',
    groupName: 'Products',
    priority: 30,
  },
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

function hasPagination(query: Record<string, unknown>): boolean {
  return query.page !== undefined || query.pageSize !== undefined;
}

function parsePagination(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, 1, 10000);
  const pageSize = parsePositiveInt(query.pageSize, 20, 200);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

function paginatedResponse<T>(data: T[], page: number, pageSize: number, total: number) {
  return {
    data,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function periodKey(date: Date, interval: 'day' | 'hour'): string {
  const iso = date.toISOString();
  return interval === 'hour' ? `${iso.slice(0, 13)}:00:00.000Z` : iso.slice(0, 10);
}

function isDateInPeriod(date: Date, period: string, interval: 'day' | 'hour'): boolean {
  return periodKey(date, interval) === period;
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

async function seedDefaultUrlGroupRules(prisma: PrismaClient): Promise<void> {
  const existingCount = await prisma.urlGroupRule.count();

  if (existingCount > 0) {
    return;
  }

  await prisma.urlGroupRule.createMany({
    data: DEFAULT_URL_GROUP_RULES.map((rule) => ({
      ...rule,
      isActive: true,
    })),
    skipDuplicates: true,
  });
}

function visitSessionWhere(query: any, config: AppConfig) {
  const { from, to } = parseDateRange(query);
  const where: any = {
    startedAt: {
      gte: from,
      lte: to,
    },
  };

  if (query.country) {
    where.OR = [
      { country: { contains: String(query.country), mode: 'insensitive' } },
      { countryCode: { equals: String(query.country), mode: 'insensitive' } },
    ];
  }

  if (query.ip) {
    const ip = extractPublicIp(String(query.ip));
    if (ip) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { ipAddress: ip },
            { ipHash: createIpHash(ip, config.ipHashSecret) },
          ],
        },
      ];
    }
  }

  if (query.landedUrlGroup) {
    where.landedUrlGroup = String(query.landedUrlGroup);
  }

  if (query.exitUrlGroup) {
    where.exitUrlGroup = String(query.exitUrlGroup);
  }

  if (query.minDurationSeconds || query.maxDurationSeconds) {
    where.sessionDurationSeconds = {
      ...(query.minDurationSeconds ? { gte: Number(query.minDurationSeconds) } : {}),
      ...(query.maxDurationSeconds ? { lte: Number(query.maxDurationSeconds) } : {}),
    };
  }

  return { where, from, to };
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
        PaginationQuerySchema,
        Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const limit = Number(query.limit || 25);
    const pagination = parsePagination(query);
    const shouldPaginate = hasPagination(query);

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
      take: shouldPaginate ? undefined : limit,
    });

    const mappedRows = rows.map((row) => ({
      company_guess: row.companyGuess,
      company_confidence: row.companyConfidence,
      network_name: row.networkName,
      asn: row.asn,
      country: row.country,
      city: row.city,
      visits: row._count._all,
    }));

    if (!shouldPaginate) {
      return mappedRows;
    }

    return paginatedResponse(
      mappedRows.slice(pagination.skip, pagination.skip + pagination.take),
      pagination.page,
      pagination.pageSize,
      mappedRows.length,
    );
  });

  app.get('/api/v1/dashboard/top-pages', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get top visited pages',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        PaginationQuerySchema,
        Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const limit = Number(query.limit || 25);
    const pagination = parsePagination(query);
    const shouldPaginate = hasPagination(query);

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
      take: shouldPaginate ? undefined : limit,
    });

    const mappedRows = rows.map((row) => ({
      page_hostname: row.normalizedPageHostname || row.pageHostname,
      page_path: row.normalizedPagePath || row.pagePath,
      page_title: row.pageTitle,
      visits: row._count._all,
    }));

    if (!shouldPaginate) {
      return mappedRows;
    }

    return paginatedResponse(
      mappedRows.slice(pagination.skip, pagination.skip + pagination.take),
      pagination.page,
      pagination.pageSize,
      mappedRows.length,
    );
  });

  app.get('/api/v1/dashboard/visited-pages-grouped', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get visited pages grouped by business section',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        PaginationQuerySchema,
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
    const pagination = parsePagination(query);
    const shouldPaginate = hasPagination(query);
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

    const mappedGroups = Array.from(groups.values())
      .sort((left, right) => right.visits - left.visits)
      .slice(0, shouldPaginate ? undefined : limitGroups)
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

    if (!shouldPaginate) {
      return mappedGroups;
    }

    return paginatedResponse(
      mappedGroups.slice(pagination.skip, pagination.skip + pagination.take),
      pagination.page,
      pagination.pageSize,
      mappedGroups.length,
    );
  });

  app.get('/api/v1/dashboard/page-group-rules', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get page grouping rules',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: PaginationQuerySchema,
    },
  }, async (request) => {
    const query = request.query as any;
    const pagination = parsePagination(query);
    const shouldPaginate = hasPagination(query);
    await seedDefaultPageGroupRules(options.prisma);
    const [rows, total] = await Promise.all([
      options.prisma.pageGroupRule.findMany({
        orderBy: [
          { isActive: 'desc' },
          { priority: 'asc' },
        ],
        skip: shouldPaginate ? pagination.skip : undefined,
        take: shouldPaginate ? pagination.take : undefined,
      }),
      shouldPaginate ? options.prisma.pageGroupRule.count() : Promise.resolve(0),
    ]);

    const mappedRows = rows.map((row) => ({
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

    if (!shouldPaginate) {
      return mappedRows;
    }

    return paginatedResponse(mappedRows, pagination.page, pagination.pageSize, total);
  });

  app.get('/api/v1/dashboard/visit-sessions', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get visit sessions',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          ip: Type.Optional(Type.String()),
          country: Type.Optional(Type.String()),
          landedUrlGroup: Type.Optional(Type.String()),
          exitUrlGroup: Type.Optional(Type.String()),
          minDurationSeconds: Type.Optional(Type.Number({ minimum: 0 })),
          maxDurationSeconds: Type.Optional(Type.Number({ minimum: 0 })),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
          offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { where } = visitSessionWhere(query, options.config);
    const limit = parsePositiveInt(query.limit, 50, 200);
    const offset = Math.max(0, Math.trunc(Number(query.offset || 0)));

    const [rows, total] = await Promise.all([
      options.prisma.visitSession.findMany({
        where,
        orderBy: {
          startedAt: 'desc',
        },
        skip: offset,
        take: limit,
        select: {
          id: true,
          startedAt: true,
          ipAddress: true,
          ipHash: true,
          country: true,
          landedUrl: true,
          landedUrlGroup: true,
          exitUrl: true,
          exitUrlGroup: true,
          sessionDurationSeconds: true,
          clientId: true,
        },
      }),
      options.prisma.visitSession.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        date: row.startedAt,
        ip_address: row.ipAddress || (options.config.storeRawIp ? null : 'hidden'),
        ip_hash: row.ipAddress ? undefined : row.ipHash,
        country: row.country,
        landed_url: row.landedUrl,
        landed_url_group: row.landedUrlGroup || 'Other pages',
        exit_url: row.exitUrl,
        exit_url_group: row.exitUrlGroup || 'Other pages',
        session_duration_seconds: row.sessionDurationSeconds,
        client_id: row.clientId,
      })),
      total,
      limit,
      offset,
    };
  });

  app.get('/api/v1/dashboard/visit-sessions/summary', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get visit session summary',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          ip: Type.Optional(Type.String()),
          country: Type.Optional(Type.String()),
          landedUrlGroup: Type.Optional(Type.String()),
          exitUrlGroup: Type.Optional(Type.String()),
          minDurationSeconds: Type.Optional(Type.Number({ minimum: 0 })),
          maxDurationSeconds: Type.Optional(Type.Number({ minimum: 0 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { where, from, to } = visitSessionWhere(query, options.config);

    const [
      totalSessions,
      durationAggregate,
      landedGroups,
      exitGroups,
      countries,
    ] = await Promise.all([
      options.prisma.visitSession.count({ where }),
      options.prisma.visitSession.aggregate({
        where,
        _avg: {
          sessionDurationSeconds: true,
        },
      }),
      options.prisma.visitSession.groupBy({
        by: ['landedUrlGroup'],
        where,
        _count: {
          _all: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      }),
      options.prisma.visitSession.groupBy({
        by: ['exitUrlGroup'],
        where,
        _count: {
          _all: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      }),
      options.prisma.visitSession.groupBy({
        by: ['country'],
        where,
        _count: {
          _all: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 10,
      }),
    ]);

    return {
      from,
      to,
      total_sessions: totalSessions,
      average_session_duration_seconds: Math.round(durationAggregate._avg.sessionDurationSeconds || 0),
      top_landed_url_groups: landedGroups.map((row) => ({
        group_name: row.landedUrlGroup || 'Other pages',
        sessions: row._count._all,
      })),
      top_exit_url_groups: exitGroups.map((row) => ({
        group_name: row.exitUrlGroup || 'Other pages',
        sessions: row._count._all,
      })),
      sessions_by_country: countries.map((row) => ({
        country: row.country || 'Unknown',
        sessions: row._count._all,
      })),
    };
  });

  app.get('/api/v1/dashboard/url-group-rules', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get active URL grouping regex rules',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    },
  }, async () => {
    await seedDefaultUrlGroupRules(options.prisma);
    const rows = await options.prisma.urlGroupRule.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        priority: 'asc',
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      pattern: row.pattern,
      group_name: row.groupName,
      priority: row.priority,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }));
  });

  app.get('/api/v1/dashboard/company-intelligence/leads', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get lead-worthy company intelligence',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          confidence: Type.Optional(Type.String()),
          country: Type.Optional(Type.String()),
          company: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
          offset: Type.Optional(Type.Number({ minimum: 0 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const limit = parsePositiveInt(query.limit, 50, 200);
    const offset = Math.max(0, Math.trunc(Number(query.offset || 0)));
    const where: any = {
      occurredAt: { gte: from, lte: to },
      ipIntelligence: {
        isLeadNetwork: true,
        companyGuess: { not: 'Unknown' },
        ...(query.confidence ? { companyConfidence: query.confidence } : {}),
        ...(query.country ? { country: { contains: String(query.country), mode: 'insensitive' } } : {}),
        ...(query.company ? { companyGuess: { contains: String(query.company), mode: 'insensitive' } } : {}),
      },
    };

    const grouped = await options.prisma.visitorEvent.groupBy({
      by: ['ipIntelligenceId'],
      where: {
        ...where,
        ipIntelligenceId: { not: null },
      },
      _count: { _all: true },
      _max: { occurredAt: true },
      orderBy: { _max: { occurredAt: 'desc' } },
    });
    const ids = grouped.map((row) => row.ipIntelligenceId).filter(Boolean) as string[];
    const [intelligenceRows, sessionRows] = await Promise.all([
      options.prisma.ipIntelligence.findMany({
        where: { id: { in: ids } },
      }),
      options.prisma.visitorEvent.findMany({
        where: {
          ...where,
          ipIntelligenceId: { in: ids },
        },
        select: {
          ipIntelligenceId: true,
          visitSessionId: true,
        },
      }),
    ]);
    const byId = new Map(intelligenceRows.map((row) => [row.id, row]));
    const sessionsByIntelligenceId = new Map<string, Set<string>>();

    sessionRows.forEach((row) => {
      if (!row.ipIntelligenceId || !row.visitSessionId) return;
      const sessions = sessionsByIntelligenceId.get(row.ipIntelligenceId) || new Set<string>();
      sessions.add(row.visitSessionId);
      sessionsByIntelligenceId.set(row.ipIntelligenceId, sessions);
    });

    const items = grouped.map((row) => {
      const intelligence = byId.get(row.ipIntelligenceId!);
      if (!intelligence) return null;
      return {
        company_guess: intelligence.companyGuess,
        company_domain: intelligence.companyDomain,
        confidence: intelligence.companyConfidence,
        country: intelligence.country,
        city: intelligence.city,
        network_name: intelligence.networkName,
        asn: intelligence.asn,
        visits: row._count._all,
        unique_sessions: sessionsByIntelligenceId.get(row.ipIntelligenceId!)?.size || 0,
        last_seen_at: row._max.occurredAt,
        reason: intelligence.companyReason,
      };
    }).filter(Boolean);

    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
    };
  });

  app.get('/api/v1/dashboard/company-intelligence/network-quality', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get company intelligence network quality',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: DateRangeQuerySchema,
    },
  }, async (request) => {
    const { from, to } = parseDateRange(request.query as any);
    const where = { occurredAt: { gte: from, lte: to } };
    const [leadNetworkVisits, weakNetworkVisits, networkTypes] = await Promise.all([
      options.prisma.visitorEvent.count({ where: { ...where, ipIntelligence: { isLeadNetwork: true } } }),
      options.prisma.visitorEvent.count({ where: { ...where, OR: [{ ipIntelligence: { isLeadNetwork: false } }, { ipIntelligenceId: null }] } }),
      options.prisma.visitorEvent.groupBy({
        by: ['ipIntelligenceId'],
        where,
        _count: { _all: true },
      }),
    ]);
    const intelligenceRows = await options.prisma.ipIntelligence.findMany({
      where: { id: { in: networkTypes.map((row) => row.ipIntelligenceId).filter(Boolean) as string[] } },
      select: { id: true, networkType: true },
    });
    const byId = new Map(intelligenceRows.map((row) => [row.id, row.networkType || 'unknown']));
    const typeCounts = new Map<string, number>();
    networkTypes.forEach((row) => {
      const networkType = row.ipIntelligenceId ? byId.get(row.ipIntelligenceId) || 'unknown' : 'unknown';
      typeCounts.set(networkType, (typeCounts.get(networkType) || 0) + row._count._all);
    });

    return {
      lead_network_visits: leadNetworkVisits,
      unknown_or_weak_network_visits: weakNetworkVisits,
      network_types: Array.from(typeCounts.entries()).map(([networkType, visits]) => ({ network_type: networkType, visits })),
    };
  });

  app.get('/api/v1/dashboard/company-ip-mappings', {
    schema: { tags: ['Dashboard'], summary: 'Get company IP mappings', security: [{ bearerAuth: [] }, { apiKeyAuth: [] }] },
  }, async () => {
    const rows = await options.prisma.companyIpMapping.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => ({
      id: row.id,
      company_name: row.companyName,
      company_domain: row.companyDomain,
      ip_range: row.ipRange,
      source: row.source,
      confidence: row.confidence,
      notes: row.notes,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    }));
  });

  app.post('/api/v1/dashboard/company-ip-mappings', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Create company IP mapping',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      body: Type.Object({
        companyName: Type.String({ minLength: 1 }),
        companyDomain: Type.Optional(Type.String()),
        ipRange: Type.String({ minLength: 1 }),
        confidence: Type.String(),
        source: Type.Optional(Type.String()),
        notes: Type.Optional(Type.String()),
      }),
    },
  }, async (request, reply) => {
    const body = request.body as any;
    if (!isIpInCidr(body.ipRange.split('/')[0], body.ipRange)) {
      return reply.status(400).send({ status: 'error', message: 'Invalid IPv4 CIDR or IP range.' });
    }
    const row = await options.prisma.companyIpMapping.create({
      data: {
        companyName: body.companyName,
        companyDomain: body.companyDomain || null,
        ipRange: body.ipRange,
        confidence: body.confidence,
        source: body.source || 'manual',
        notes: body.notes || null,
      },
    });
    return row;
  });

  app.patch('/api/v1/dashboard/company-ip-mappings/:id', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Update company IP mapping',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      params: Type.Object({ id: Type.String() }),
      body: Type.Partial(Type.Object({
        companyName: Type.String(),
        companyDomain: Type.String(),
        ipRange: Type.String(),
        confidence: Type.String(),
        source: Type.String(),
        notes: Type.String(),
        isActive: Type.Boolean(),
      })),
    },
  }, async (request, reply) => {
    const params = request.params as any;
    const body = request.body as any;
    if (body.ipRange && !isIpInCidr(body.ipRange.split('/')[0], body.ipRange)) {
      return reply.status(400).send({ status: 'error', message: 'Invalid IPv4 CIDR or IP range.' });
    }
    return options.prisma.companyIpMapping.update({ where: { id: params.id }, data: body });
  });

  app.delete('/api/v1/dashboard/company-ip-mappings/:id', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Disable company IP mapping',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      params: Type.Object({ id: Type.String() }),
    },
  }, async (request) => {
    const params = request.params as any;
    return options.prisma.companyIpMapping.update({ where: { id: params.id }, data: { isActive: false } });
  });

  app.get('/api/v1/dashboard/network-classifier-rules', {
    schema: { tags: ['Dashboard'], summary: 'Get active network classifier rules', security: [{ bearerAuth: [] }, { apiKeyAuth: [] }] },
  }, async () => {
    return options.prisma.networkClassifierRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
    });
  });

  app.get('/api/v1/dashboard/user-analytics/summary', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get anonymous user analytics summary',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          activeWindowMinutes: Type.Optional(Type.Number({ minimum: 1, maximum: 1440 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const activeWindowMinutes = parsePositiveInt(query.activeWindowMinutes, 5, 1440);
    const activeSince = new Date(Date.now() - activeWindowMinutes * 60 * 1000);
    const eventWhere = {
      occurredAt: {
        gte: from,
        lte: to,
      },
      visitorId: {
        not: null,
      },
    };

    const [activeUsers, newUsers, totalEvents, visitorGroups] = await Promise.all([
      options.prisma.anonymousVisitor.count({
        where: {
          lastSeenAt: {
            gte: activeSince,
          },
        },
      }),
      options.prisma.anonymousVisitor.count({
        where: {
          firstSeenAt: {
            gte: from,
            lte: to,
          },
        },
      }),
      options.prisma.visitorEvent.count({
        where: {
          occurredAt: {
            gte: from,
            lte: to,
          },
        },
      }),
      options.prisma.visitorEvent.groupBy({
        by: ['visitorId'],
        where: eventWhere,
      }),
    ]);

    const visitorIds = visitorGroups.map((row) => row.visitorId).filter(Boolean) as string[];
    const visitors = visitorIds.length
      ? await options.prisma.anonymousVisitor.findMany({
          where: {
            id: {
              in: visitorIds,
            },
          },
          select: {
            id: true,
            firstSeenAt: true,
          },
        })
      : [];
    const returningUsers = visitors.filter((visitor) => visitor.firstSeenAt < from).length;
    const totalUniqueUsers = visitorIds.length;

    return {
      active_users: activeUsers,
      new_users: newUsers,
      returning_users: returningUsers,
      total_unique_users: totalUniqueUsers,
      total_events: totalEvents,
      average_events_per_user: totalUniqueUsers > 0 ? Number((totalEvents / totalUniqueUsers).toFixed(2)) : 0,
      active_window_minutes: activeWindowMinutes,
    };
  });

  app.get('/api/v1/dashboard/user-analytics/chart', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get anonymous user analytics trend chart',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        Type.Object({
          interval: Type.Optional(Type.Union([Type.Literal('day'), Type.Literal('hour')])),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const { from, to } = parseDateRange(query);
    const interval = query.interval === 'hour' ? 'hour' : 'day';
    const events = await options.prisma.visitorEvent.findMany({
      where: {
        occurredAt: {
          gte: from,
          lte: to,
        },
        visitorId: {
          not: null,
        },
      },
      orderBy: {
        occurredAt: 'asc',
      },
      select: {
        occurredAt: true,
        visitorId: true,
        visitor: {
          select: {
            firstSeenAt: true,
          },
        },
      },
    });
    const buckets = new Map<string, { period: string; users: Set<string>; newUsers: Set<string>; events: number }>();

    events.forEach((event) => {
      if (!event.visitorId) return;
      const key = periodKey(event.occurredAt, interval);
      const bucket = buckets.get(key) || { period: key, users: new Set<string>(), newUsers: new Set<string>(), events: 0 };
      bucket.users.add(event.visitorId);
      if (event.visitor?.firstSeenAt && isDateInPeriod(event.visitor.firstSeenAt, key, interval)) {
        bucket.newUsers.add(event.visitorId);
      }
      bucket.events += 1;
      buckets.set(key, bucket);
    });

    return Array.from(buckets.values()).map((bucket) => {
      const uniqueUsers = bucket.users.size;
      const newUsers = bucket.newUsers.size;
      return {
        period: bucket.period,
        unique_users: uniqueUsers,
        new_users: newUsers,
        returning_users: Math.max(0, uniqueUsers - newUsers),
        events: bucket.events,
      };
    });
  });

  app.get('/api/v1/dashboard/user-analytics/recent-active-users', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get recent active anonymous users',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Object({
        activeWindowMinutes: Type.Optional(Type.Number({ minimum: 1, maximum: 1440 })),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
      }),
    },
  }, async (request) => {
    const query = request.query as any;
    const activeWindowMinutes = parsePositiveInt(query.activeWindowMinutes, 5, 1440);
    const limit = parsePositiveInt(query.limit, 50, 200);
    const activeSince = new Date(Date.now() - activeWindowMinutes * 60 * 1000);
    const rows = await options.prisma.anonymousVisitor.findMany({
      where: {
        lastSeenAt: {
          gte: activeSince,
        },
      },
      orderBy: {
        lastSeenAt: 'desc',
      },
      take: limit,
      select: {
        id: true,
        clientId: true,
        lastSeenAt: true,
        lastCountry: true,
        lastPageUrl: true,
        eventCount: true,
        sessionCount: true,
      },
    });

    return rows.map((row) => ({
      visitor_id: row.id,
      client_id: row.clientId,
      last_seen_at: row.lastSeenAt,
      country: row.lastCountry,
      last_page_url: row.lastPageUrl,
      event_count: row.eventCount,
      session_count: row.sessionCount,
    }));
  });

  app.get('/api/v1/dashboard/recent-visits', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get recent visitor events',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        DateRangeQuerySchema,
        PaginationQuerySchema,
        Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
          ip: Type.Optional(Type.String()),
          country: Type.Optional(Type.String()),
          company: Type.Optional(Type.String()),
          confidence: Type.Optional(Type.String()),
          pageSearch: Type.Optional(Type.String()),
          source: Type.Optional(Type.String()),
          eventName: Type.Optional(Type.String()),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const limit = Number(query.limit || 50);
    const pagination = parsePagination(query);
    const shouldPaginate = hasPagination(query);
    const where: any = {};

    if (query.from || query.to) {
      const { from, to } = parseDateRange(query);
      where.occurredAt = {
        gte: from,
        lte: to,
      };
    }

    if (query.ip) {
      const ip = extractPublicIp(String(query.ip));
      if (ip) {
        where.AND = [
          ...(where.AND || []),
          {
            OR: [
              { ipAddress: ip },
              { ipHash: createIpHash(ip, options.config.ipHashSecret) },
            ],
          },
        ];
      }
    }

    if (query.country) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { country: { contains: String(query.country), mode: 'insensitive' } },
            { countryCode: { equals: String(query.country), mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (query.company) {
      where.companyGuess = {
        contains: String(query.company),
        mode: 'insensitive',
      };
    }

    if (query.confidence) {
      where.companyConfidence = String(query.confidence);
    }

    if (query.pageSearch) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { pageTitle: { contains: String(query.pageSearch), mode: 'insensitive' } },
            { pageUrl: { contains: String(query.pageSearch), mode: 'insensitive' } },
            { pagePath: { contains: String(query.pageSearch), mode: 'insensitive' } },
            { normalizedPagePath: { contains: String(query.pageSearch), mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (query.source) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { utmSource: { contains: String(query.source), mode: 'insensitive' } },
            { utmMedium: { contains: String(query.source), mode: 'insensitive' } },
            { utmCampaign: { contains: String(query.source), mode: 'insensitive' } },
            { referrer: { contains: String(query.source), mode: 'insensitive' } },
          ],
        },
      ];
    }

    if (query.eventName) {
      where.eventName = {
        contains: String(query.eventName),
        mode: 'insensitive',
      };
    }

    const [rows, total] = await Promise.all([
      options.prisma.visitorEvent.findMany({
        where,
        orderBy: {
          occurredAt: 'desc',
        },
        skip: shouldPaginate ? pagination.skip : undefined,
        take: shouldPaginate ? pagination.take : limit,
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
      }),
      shouldPaginate ? options.prisma.visitorEvent.count({ where }) : Promise.resolve(0),
    ]);

    const mappedRows = rows.map((row) => ({
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

    if (!shouldPaginate) {
      return mappedRows;
    }

    return paginatedResponse(mappedRows, pagination.page, pagination.pageSize, total);
  });

  app.get('/api/v1/dashboard/ip-intelligence', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get recent IP intelligence records',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      querystring: Type.Intersect([
        PaginationQuerySchema,
        Type.Object({
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
        }),
      ]),
    },
  }, async (request) => {
    const query = request.query as any;
    const limit = Number(query.limit || 100);
    const pagination = parsePagination(query);
    const shouldPaginate = hasPagination(query);

    const [rows, total] = await Promise.all([
      options.prisma.ipIntelligence.findMany({
        orderBy: {
          updatedAt: 'desc',
        },
        skip: shouldPaginate ? pagination.skip : undefined,
        take: shouldPaginate ? pagination.take : limit,
        select: {
          id: true,
          ipAddress: true,
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
      }),
      shouldPaginate ? options.prisma.ipIntelligence.count() : Promise.resolve(0),
    ]);

    const mappedRows = rows.map((row) => ({
      id: row.id,
      ip_address: row.ipAddress,
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

    if (!shouldPaginate) {
      return mappedRows;
    }

    return paginatedResponse(mappedRows, pagination.page, pagination.pageSize, total);
  });
}
