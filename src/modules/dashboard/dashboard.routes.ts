import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { PrismaClient } from '@prisma/client';
import type { AppConfig } from '../../config/env';
import { requireApiKey } from '../../shared/auth';
import { parseDateRange } from '../../shared/date-range';

type Options = {
  config: AppConfig;
  prisma: PrismaClient;
};

const DateRangeQuerySchema = Type.Object({
  from: Type.Optional(Type.String()),
  to: Type.Optional(Type.String()),
});

function commonWhere(from: Date, to: Date) {
  return {
    occurredAt: {
      gte: from,
      lte: to,
    },
  };
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
      by: ['pageHostname', 'pagePath', 'pageTitle'],
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
      page_hostname: row.pageHostname,
      page_path: row.pagePath,
      page_title: row.pageTitle,
      visits: row._count._all,
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
