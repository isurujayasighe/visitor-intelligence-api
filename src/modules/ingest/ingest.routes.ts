import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { AppConfig } from '../../config/env';
import { requireApiKey } from '../../shared/auth';
import type { IngestService } from './ingest.service';
import { IngestVisitorEventBodySchema } from './ingest.schema';

type Options = {
  config: AppConfig;
  ingestService: IngestService;
};

export async function registerIngestRoutes(app: FastifyInstance, options: Options): Promise<void> {
  app.post('/api/v1/ingest/visitor-event', {
    schema: {
      tags: ['Ingest'],
      summary: 'Ingest a visitor event',
      description: 'Accepts a Server GTM visitor event, enriches it with IP intelligence, and stores it.',
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      body: IngestVisitorEventBodySchema,
      response: {
        200: Type.Object({
          status: Type.String(),
          event_id: Type.String(),
          ip: Type.String(),
          country: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          region: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          city: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          asn: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          network_name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          company_guess: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          company_confidence: Type.String(),
        }),
      },
    },
  }, async (request, reply) => {
    requireApiKey(request, options.config.ingestApiKey);

    const result = await options.ingestService.ingest(request.body as any, {
      forwardedFor: request.headers['x-forwarded-for'],
      remoteIp: request.ip,
    });

    return reply.send({
      status: 'logged',
      event_id: result.event.id,
      ip: result.ip,
      country: result.intelligence.country,
      region: result.intelligence.region,
      city: result.intelligence.city,
      asn: result.intelligence.asn,
      network_name: result.intelligence.networkName,
      company_guess: result.intelligence.companyGuess,
      company_confidence: result.intelligence.companyConfidence,
    });
  });
}
