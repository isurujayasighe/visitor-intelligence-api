-- CreateEnum
CREATE TYPE "CompanyConfidence" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "IpIntelligence" (
    "id" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "regionCode" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyRadius" INTEGER,
    "timezone" TEXT,
    "asn" TEXT,
    "asName" TEXT,
    "asDomain" TEXT,
    "asnNetwork" TEXT,
    "reverseDns" TEXT,
    "rdapName" TEXT,
    "rdapEntity" TEXT,
    "networkName" TEXT,
    "companyGuess" TEXT,
    "companyDomain" TEXT,
    "companyConfidence" "CompanyConfidence" NOT NULL DEFAULT 'low',
    "companyReason" TEXT,
    "geoSource" TEXT,
    "asnSource" TEXT,
    "lookupSource" TEXT,
    "lastLookupAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorEvent" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventName" TEXT NOT NULL,
    "clientId" TEXT,
    "pageUrl" TEXT,
    "pageHostname" TEXT,
    "pagePath" TEXT,
    "pageTitle" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "ipHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "asn" TEXT,
    "networkName" TEXT,
    "companyGuess" TEXT,
    "companyConfidence" "CompanyConfidence" NOT NULL DEFAULT 'low',
    "ipIntelligenceId" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IpIntelligence_ipHash_key" ON "IpIntelligence"("ipHash");

-- CreateIndex
CREATE INDEX "IpIntelligence_countryCode_idx" ON "IpIntelligence"("countryCode");

-- CreateIndex
CREATE INDEX "IpIntelligence_asn_idx" ON "IpIntelligence"("asn");

-- CreateIndex
CREATE INDEX "IpIntelligence_companyGuess_idx" ON "IpIntelligence"("companyGuess");

-- CreateIndex
CREATE INDEX "IpIntelligence_companyConfidence_idx" ON "IpIntelligence"("companyConfidence");

-- CreateIndex
CREATE INDEX "VisitorEvent_occurredAt_idx" ON "VisitorEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "VisitorEvent_eventName_idx" ON "VisitorEvent"("eventName");

-- CreateIndex
CREATE INDEX "VisitorEvent_countryCode_idx" ON "VisitorEvent"("countryCode");

-- CreateIndex
CREATE INDEX "VisitorEvent_companyGuess_idx" ON "VisitorEvent"("companyGuess");

-- CreateIndex
CREATE INDEX "VisitorEvent_companyConfidence_idx" ON "VisitorEvent"("companyConfidence");

-- CreateIndex
CREATE INDEX "VisitorEvent_pageHostname_idx" ON "VisitorEvent"("pageHostname");

-- CreateIndex
CREATE INDEX "VisitorEvent_pagePath_idx" ON "VisitorEvent"("pagePath");

-- CreateIndex
CREATE INDEX "VisitorEvent_utmSource_idx" ON "VisitorEvent"("utmSource");

-- AddForeignKey
ALTER TABLE "VisitorEvent" ADD CONSTRAINT "VisitorEvent_ipIntelligenceId_fkey" FOREIGN KEY ("ipIntelligenceId") REFERENCES "IpIntelligence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
