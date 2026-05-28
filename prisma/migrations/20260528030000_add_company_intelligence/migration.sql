-- AlterTable
ALTER TABLE "IpIntelligence"
ADD COLUMN     "networkType" TEXT,
ADD COLUMN     "isLeadNetwork" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "companySource" TEXT,
ADD COLUMN     "companyEvidence" JSONB,
ADD COLUMN     "matchedCompanyMappingId" TEXT,
ADD COLUMN     "matchedNetworkRuleId" TEXT;

-- CreateTable
CREATE TABLE "CompanyIpMapping" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyDomain" TEXT,
    "ipRange" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyIpMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkClassifierRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "networkType" TEXT NOT NULL,
    "isLeadNetwork" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkClassifierRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IpIntelligence_networkType_idx" ON "IpIntelligence"("networkType");

-- CreateIndex
CREATE INDEX "IpIntelligence_isLeadNetwork_idx" ON "IpIntelligence"("isLeadNetwork");

-- CreateIndex
CREATE INDEX "CompanyIpMapping_companyName_idx" ON "CompanyIpMapping"("companyName");

-- CreateIndex
CREATE INDEX "CompanyIpMapping_companyDomain_idx" ON "CompanyIpMapping"("companyDomain");

-- CreateIndex
CREATE INDEX "CompanyIpMapping_isActive_idx" ON "CompanyIpMapping"("isActive");

-- CreateIndex
CREATE INDEX "NetworkClassifierRule_isActive_priority_idx" ON "NetworkClassifierRule"("isActive", "priority");

-- CreateIndex
CREATE INDEX "NetworkClassifierRule_networkType_idx" ON "NetworkClassifierRule"("networkType");

-- SeedData
INSERT INTO "NetworkClassifierRule" ("id", "name", "pattern", "matchType", "networkType", "isLeadNetwork", "priority", "isActive", "updatedAt")
VALUES
  ('network_rule_isp_telecom', 'ISP telecom keyword', 'telecom', 'keyword', 'isp', false, 10, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_communications', 'ISP communications keyword', 'communications', 'keyword', 'isp', false, 11, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_broadband', 'ISP broadband keyword', 'broadband', 'keyword', 'isp', false, 12, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_internet', 'ISP internet keyword', 'internet', 'keyword', 'isp', false, 13, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_mobile', 'Mobile keyword', 'mobile', 'keyword', 'mobile', false, 20, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_cellular', 'Cellular keyword', 'cellular', 'keyword', 'mobile', false, 21, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_wireless', 'Wireless keyword', 'wireless', 'keyword', 'mobile', false, 22, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_fiber', 'Fiber keyword', 'fiber', 'keyword', 'isp', false, 23, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_fibre', 'Fibre keyword', 'fibre', 'keyword', 'isp', false, 24, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_isp', 'ISP keyword', 'isp', 'keyword', 'isp', false, 25, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_dialog', 'Dialog keyword', 'dialog', 'keyword', 'mobile', false, 30, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_mobitel', 'Mobitel keyword', 'mobitel', 'keyword', 'mobile', false, 31, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_slt', 'SLT keyword', 'slt', 'keyword', 'isp', false, 32, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_sri_lanka_telecom', 'Sri Lanka Telecom keyword', 'sri lanka telecom', 'keyword', 'isp', false, 33, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_airtel', 'Airtel keyword', 'airtel', 'keyword', 'mobile', false, 34, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_hutch', 'Hutch keyword', 'hutch', 'keyword', 'mobile', false, 35, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_verizon', 'Verizon keyword', 'verizon', 'keyword', 'isp', false, 36, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_comcast', 'Comcast keyword', 'comcast', 'keyword', 'isp', false, 37, true, CURRENT_TIMESTAMP),
  ('network_rule_mobile_vodafone', 'Vodafone keyword', 'vodafone', 'keyword', 'mobile', false, 38, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_orange', 'Orange keyword', 'orange', 'keyword', 'isp', false, 39, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_bt', 'BT keyword', 'bt', 'keyword', 'isp', false, 40, true, CURRENT_TIMESTAMP),
  ('network_rule_isp_sky_broadband', 'Sky Broadband keyword', 'sky broadband', 'keyword', 'isp', false, 41, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_amazon', 'Amazon cloud keyword', 'amazon', 'keyword', 'cloud', false, 50, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_aws', 'AWS keyword', 'aws', 'keyword', 'cloud', false, 51, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_google_cloud', 'Google Cloud keyword', 'google cloud', 'keyword', 'cloud', false, 52, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_google_llc', 'Google LLC keyword', 'google llc', 'keyword', 'cloud', false, 53, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_microsoft', 'Microsoft cloud keyword', 'microsoft', 'keyword', 'cloud', false, 54, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_azure', 'Azure keyword', 'azure', 'keyword', 'cloud', false, 55, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_cloudflare', 'Cloudflare keyword', 'cloudflare', 'keyword', 'cloud', false, 56, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_digitalocean', 'DigitalOcean keyword', 'digitalocean', 'keyword', 'cloud', false, 57, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_linode', 'Linode keyword', 'linode', 'keyword', 'cloud', false, 58, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_akamai', 'Akamai keyword', 'akamai', 'keyword', 'cloud', false, 59, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_fastly', 'Fastly keyword', 'fastly', 'keyword', 'cloud', false, 60, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_hetzner', 'Hetzner keyword', 'hetzner', 'keyword', 'cloud', false, 61, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_ovh', 'OVH keyword', 'ovh', 'keyword', 'cloud', false, 62, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_hosting', 'Hosting keyword', 'hosting', 'keyword', 'cloud', false, 63, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_data_center', 'Data center keyword', 'data center', 'keyword', 'cloud', false, 64, true, CURRENT_TIMESTAMP),
  ('network_rule_cloud_datacenter', 'Datacenter keyword', 'datacenter', 'keyword', 'cloud', false, 65, true, CURRENT_TIMESTAMP),
  ('network_rule_vpn_vpn', 'VPN keyword', 'vpn', 'keyword', 'vpn', false, 70, true, CURRENT_TIMESTAMP),
  ('network_rule_proxy_proxy', 'Proxy keyword', 'proxy', 'keyword', 'proxy', false, 71, true, CURRENT_TIMESTAMP),
  ('network_rule_proxy_tor', 'Tor keyword', 'tor', 'keyword', 'proxy', false, 72, true, CURRENT_TIMESTAMP),
  ('network_rule_proxy_anonymizer', 'Anonymizer keyword', 'anonymizer', 'keyword', 'proxy', false, 73, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
