-- AlterTable
ALTER TABLE "VisitorEvent" ADD COLUMN "visitorId" TEXT;

-- CreateTable
CREATE TABLE "AnonymousVisitor" (
    "id" TEXT NOT NULL,
    "visitorKey" TEXT NOT NULL,
    "clientId" TEXT,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "firstCountry" TEXT,
    "firstCountryCode" TEXT,
    "lastCountry" TEXT,
    "lastCountryCode" TEXT,
    "firstPageUrl" TEXT,
    "lastPageUrl" TEXT,
    "firstUtmSource" TEXT,
    "firstUtmMedium" TEXT,
    "firstUtmCampaign" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnonymousVisitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnonymousVisitor_visitorKey_key" ON "AnonymousVisitor"("visitorKey");

-- CreateIndex
CREATE INDEX "AnonymousVisitor_firstSeenAt_idx" ON "AnonymousVisitor"("firstSeenAt");

-- CreateIndex
CREATE INDEX "AnonymousVisitor_lastSeenAt_idx" ON "AnonymousVisitor"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AnonymousVisitor_clientId_idx" ON "AnonymousVisitor"("clientId");

-- CreateIndex
CREATE INDEX "AnonymousVisitor_firstCountryCode_idx" ON "AnonymousVisitor"("firstCountryCode");

-- CreateIndex
CREATE INDEX "AnonymousVisitor_lastCountryCode_idx" ON "AnonymousVisitor"("lastCountryCode");

-- CreateIndex
CREATE INDEX "VisitorEvent_visitorId_idx" ON "VisitorEvent"("visitorId");

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "AnonymousVisitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
