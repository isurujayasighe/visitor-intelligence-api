import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

type VisitorIdentityInput = {
  clientId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

type UpsertAnonymousVisitorInput = VisitorIdentityInput & {
  occurredAt: Date;
  country?: string | null;
  countryCode?: string | null;
  pageUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  visitSessionId?: string | null;
};

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createUserAgentHash(userAgent?: string | null): string | null {
  const trimmed = userAgent?.trim();
  return trimmed ? sha256(trimmed) : null;
}

export function createVisitorKey(input: VisitorIdentityInput): string {
  const clientId = input.clientId?.trim();
  const ipHash = input.ipHash?.trim();
  const userAgent = input.userAgent?.trim();

  if (clientId) {
    return `client:${clientId}`;
  }

  if (ipHash && userAgent) {
    return `ipua:${sha256(`${ipHash}:${userAgent}`)}`;
  }

  if (ipHash) {
    return `ip:${ipHash}`;
  }

  return `unknown:${sha256(userAgent || 'anonymous')}`;
}

export class VisitorIdentityService {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertAnonymousVisitor(input: UpsertAnonymousVisitorInput) {
    const visitorKey = createVisitorKey(input);
    const userAgentHash = createUserAgentHash(input.userAgent);
    const existing = await this.prisma.anonymousVisitor.findUnique({
      where: {
        visitorKey,
      },
    });

    if (!existing) {
      return this.prisma.anonymousVisitor.create({
        data: {
          visitorKey,
          clientId: input.clientId || null,
          ipHash: input.ipHash || null,
          userAgentHash,
          firstSeenAt: input.occurredAt,
          lastSeenAt: input.occurredAt,
          firstCountry: input.country || null,
          firstCountryCode: input.countryCode || null,
          lastCountry: input.country || null,
          lastCountryCode: input.countryCode || null,
          firstPageUrl: input.pageUrl || null,
          lastPageUrl: input.pageUrl || null,
          firstUtmSource: input.utmSource || null,
          firstUtmMedium: input.utmMedium || null,
          firstUtmCampaign: input.utmCampaign || null,
          eventCount: 1,
          sessionCount: input.visitSessionId ? 1 : 0,
        },
      });
    }

    const existingSessionCount = input.visitSessionId
      ? await this.prisma.visitorEvent.count({
          where: {
            visitorId: existing.id,
            visitSessionId: input.visitSessionId,
          },
        })
      : 1;

    return this.prisma.anonymousVisitor.update({
      where: {
        visitorKey,
      },
      data: {
        clientId: existing.clientId || input.clientId || null,
        ipHash: existing.ipHash || input.ipHash || null,
        userAgentHash: existing.userAgentHash || userAgentHash,
        firstSeenAt: input.occurredAt < existing.firstSeenAt ? input.occurredAt : existing.firstSeenAt,
        lastSeenAt: input.occurredAt > existing.lastSeenAt ? input.occurredAt : existing.lastSeenAt,
        lastCountry: input.country || existing.lastCountry,
        lastCountryCode: input.countryCode || existing.lastCountryCode,
        lastPageUrl: input.pageUrl || existing.lastPageUrl,
        eventCount: {
          increment: 1,
        },
        ...(input.visitSessionId && existingSessionCount === 0
          ? {
              sessionCount: {
                increment: 1,
              },
            }
          : {}),
      },
    });
  }
}
