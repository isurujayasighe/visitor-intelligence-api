import { PrismaClient } from '@prisma/client';
import { normalizeAndGroupUrl, type GroupedUrl, type UrlGroupRuleLike } from '../modules/url-grouping/url-normalizer.service';

const prisma = new PrismaClient();

function buildFallbackSessionKey(event: { ipHash: string; clientId: string | null; occurredAt: Date }) {
  const bucket = Math.floor(event.occurredAt.getTime() / (30 * 60 * 1000));
  return `${event.ipHash}:${event.clientId || 'anonymous'}:${bucket}`;
}

async function upsertSession(event: {
  id: string;
  occurredAt: Date;
  clientId: string | null;
  ipHash: string;
  ipAddress: string | null;
  country: string | null;
  countryCode: string | null;
  userAgent: string | null;
}, groupedUrl: GroupedUrl) {
  const sessionKey = buildFallbackSessionKey(event);
  const existing = await prisma.visitSession.findUnique({ where: { sessionKey } });

  if (!existing) {
    const session = await prisma.visitSession.create({
      data: {
        sessionKey,
        clientId: event.clientId,
        ipHash: event.ipHash,
        ipAddress: event.ipAddress,
        country: event.country,
        countryCode: event.countryCode,
        startedAt: event.occurredAt,
        endedAt: event.occurredAt,
        sessionDurationSeconds: 0,
        landedUrl: groupedUrl.originalUrl,
        landedUrlHostname: groupedUrl.hostname,
        landedUrlPath: groupedUrl.path,
        landedUrlGroup: groupedUrl.groupName,
        landedUrlGroupRuleId: groupedUrl.groupRuleId,
        exitUrl: groupedUrl.originalUrl,
        exitUrlHostname: groupedUrl.hostname,
        exitUrlPath: groupedUrl.path,
        exitUrlGroup: groupedUrl.groupName,
        exitUrlGroupRuleId: groupedUrl.groupRuleId,
        userAgent: event.userAgent,
      },
    });

    return session.id;
  }

  const startedAt = event.occurredAt < existing.startedAt ? event.occurredAt : existing.startedAt;
  const previousEndedAt = existing.endedAt || existing.startedAt;
  const endedAt = event.occurredAt > previousEndedAt ? event.occurredAt : previousEndedAt;
  const shouldReplaceLanded = event.occurredAt < existing.startedAt || !existing.landedUrl;
  const shouldReplaceExit = event.occurredAt >= previousEndedAt;

  const session = await prisma.visitSession.update({
    where: { sessionKey },
    data: {
      startedAt,
      endedAt,
      sessionDurationSeconds: Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000)),
      ...(shouldReplaceLanded ? {
        landedUrl: groupedUrl.originalUrl,
        landedUrlHostname: groupedUrl.hostname,
        landedUrlPath: groupedUrl.path,
        landedUrlGroup: groupedUrl.groupName,
        landedUrlGroupRuleId: groupedUrl.groupRuleId,
      } : {}),
      ...(shouldReplaceExit ? {
        exitUrl: groupedUrl.originalUrl,
        exitUrlHostname: groupedUrl.hostname,
        exitUrlPath: groupedUrl.path,
        exitUrlGroup: groupedUrl.groupName,
        exitUrlGroupRuleId: groupedUrl.groupRuleId,
      } : {}),
    },
  });

  return session.id;
}

async function main() {
  const rules: UrlGroupRuleLike[] = await prisma.urlGroupRule.findMany({
    where: { isActive: true },
    orderBy: { priority: 'asc' },
    select: { id: true, name: true, pattern: true, groupName: true, priority: true },
  });

  const events = await prisma.visitorEvent.findMany({
    where: { visitSessionId: null },
    orderBy: { occurredAt: 'asc' },
    select: {
      id: true,
      occurredAt: true,
      clientId: true,
      ipHash: true,
      ipAddress: true,
      country: true,
      countryCode: true,
      userAgent: true,
      pageUrl: true,
      pagePath: true,
      referrer: true,
    },
  });

  let updated = 0;

  for (const event of events) {
    const groupedUrl = normalizeAndGroupUrl({
      pageUrl: event.pageUrl,
      pagePath: event.pagePath,
      referrer: event.referrer,
    }, rules);
    const sessionId = await upsertSession(event, groupedUrl);

    await prisma.visitorEvent.update({
      where: { id: event.id },
      data: { visitSessionId: sessionId },
    });

    updated += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`Backfilled ${updated} visitor events into visit sessions.`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
