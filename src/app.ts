import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { PrismaClient } from '@prisma/client';
import { Type } from '@sinclair/typebox';
import type { FastifyError } from 'fastify';
import type { AppConfig } from './config/env';
import { createLoggerOptions } from './config/logger';
import { createMaxMindService } from './modules/ip-intelligence/maxmind.service';
import { IpIntelligenceService } from './modules/ip-intelligence/ip-intelligence.service';
import { IngestService } from './modules/ingest/ingest.service';
import { registerIngestRoutes } from './modules/ingest/ingest.routes';
import { registerDashboardRoutes } from './modules/dashboard/dashboard.routes';

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: createLoggerOptions(config),
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(helmet);
  await app.register(cors, {
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    credentials: false,
  });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Visitor Intelligence API',
        description: 'Fastify API for Server GTM visitor ingest, IP intelligence, and marketing dashboard data.',
        version: '1.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
          },
        },
      },
      tags: [
        { name: 'Health', description: 'Service health checks' },
        { name: 'Ingest', description: 'Visitor event ingest endpoints' },
        { name: 'Dashboard', description: 'Marketing dashboard reporting endpoints' },
      ],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    staticCSP: true,
    transformStaticCSP: (header) => header,
    uiConfig: {
      deepLinking: true,
      docExpansion: 'list',
    },
  });

  const prisma = new PrismaClient();
  const maxMind = await createMaxMindService(config);

  const ipIntelligenceService = new IpIntelligenceService({
    config,
    prisma,
    maxMind,
  });

  const ingestService = new IngestService({
    config,
    prisma,
    ipIntelligenceService,
  });

  app.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Check API health',
      response: {
        200: Type.Object({
          status: Type.String(),
          service: Type.String(),
          maxmind: Type.Object({
            cityDbLoaded: Type.Boolean(),
            asnDbLoaded: Type.Boolean(),
          }),
        }),
      },
    },
  }, async () => ({
    status: 'ok',
    service: 'visitor-intelligence-api',
    maxmind: maxMind.status(),
  }));

  await registerIngestRoutes(app, {
    config,
    ingestService,
  });

  await registerDashboardRoutes(app, {
    config,
    prisma,
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ error }, 'Unhandled request error');

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    return reply.status(statusCode).send({
      status: 'error',
      message: statusCode >= 500 ? 'Internal server error' : error.message,
    });
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
    maxMind.close();
  });

  return app;
}
