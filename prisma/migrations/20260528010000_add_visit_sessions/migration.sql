-- AlterTable
ALTER TABLE "VisitorEvent"
ADD COLUMN     "visitSessionId" TEXT;

-- CreateTable
CREATE TABLE "VisitSession" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "clientId" TEXT,
    "ipHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "sessionDurationSeconds" INTEGER,
    "landedUrl" TEXT,
    "landedUrlHostname" TEXT,
    "landedUrlPath" TEXT,
    "landedUrlGroup" TEXT,
    "landedUrlGroupRuleId" TEXT,
    "exitUrl" TEXT,
    "exitUrlHostname" TEXT,
    "exitUrlPath" TEXT,
    "exitUrlGroup" TEXT,
    "exitUrlGroupRuleId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UrlGroupRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pattern" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UrlGroupRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitSession_sessionKey_key" ON "VisitSession"("sessionKey");

-- CreateIndex
CREATE INDEX "VisitSession_startedAt_idx" ON "VisitSession"("startedAt");

-- CreateIndex
CREATE INDEX "VisitSession_countryCode_idx" ON "VisitSession"("countryCode");

-- CreateIndex
CREATE INDEX "VisitSession_landedUrlGroup_idx" ON "VisitSession"("landedUrlGroup");

-- CreateIndex
CREATE INDEX "VisitSession_exitUrlGroup_idx" ON "VisitSession"("exitUrlGroup");

-- CreateIndex
CREATE INDEX "VisitSession_ipHash_idx" ON "VisitSession"("ipHash");

-- CreateIndex
CREATE INDEX "VisitSession_sessionDurationSeconds_idx" ON "VisitSession"("sessionDurationSeconds");

-- CreateIndex
CREATE INDEX "VisitorEvent_visitSessionId_idx" ON "VisitorEvent"("visitSessionId");

-- CreateIndex
CREATE INDEX "UrlGroupRule_isActive_priority_idx" ON "UrlGroupRule"("isActive", "priority");

-- CreateIndex
CREATE INDEX "UrlGroupRule_groupName_idx" ON "UrlGroupRule"("groupName");

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_visitSessionId_fkey" FOREIGN KEY ("visitSessionId") REFERENCES "VisitSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData
INSERT INTO "UrlGroupRule" ("id", "name", "description", "pattern", "groupName", "priority", "isActive", "updatedAt")
VALUES
  ('default_core_services_url_group_rule', 'Core services URLs', 'Core service page paths', '^/services/(ifs|ifs-applications|integration|implementation|support|managed-services|outlook-integration|work-orders|scheduling).*$', 'Core services', 10, true, CURRENT_TIMESTAMP),
  ('default_advisory_services_url_group_rule', 'Advisory services URLs', 'Advisory and consulting page paths', '^/services/(business-strategy|business-strategy-assignment|advisory|consulting|digital-transformation|erp-advisory).*$', 'Advisory services', 20, true, CURRENT_TIMESTAMP),
  ('default_products_url_group_rule', 'Products URLs', 'Product page paths', '^/products/.*$', 'Products', 30, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
