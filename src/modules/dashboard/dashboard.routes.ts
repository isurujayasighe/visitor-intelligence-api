import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../config/env';
import { requireApiKey } from '../../shared/auth';
import { parseDateRange } from '../../shared/date-range';
import { createIpHash } from '../ip-intelligence/ip-hash';
import { extractPublicIp } from '../ip-intelligence/ip-normalizer';
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

  app.get('/api/v1/dashboard/recent-visits', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get recent visitor events',
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
    const limit = Number(query.limit || 50);
    const pagination = parsePagination(query);
    const shouldPaginate = hasPagination(query);

    const [rows, total] = await Promise.all([
      options.prisma.visitorEvent.findMany({
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
      shouldPaginate ? options.prisma.visitorEvent.count() : Promise.resolve(0),
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
