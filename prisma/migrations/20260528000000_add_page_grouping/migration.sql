-- AlterTable
ALTER TABLE "VisitorEvent"
ADD COLUMN     "normalizedPageUrl" TEXT,
ADD COLUMN     "normalizedPageHostname" TEXT,
ADD COLUMN     "normalizedPagePath" TEXT,
ADD COLUMN     "pageGroup" TEXT,
ADD COLUMN     "pageGroupSource" TEXT,
ADD COLUMN     "pageSlug" TEXT;

-- CreateTable
CREATE TABLE "PageGroupRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageGroupRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitorEvent_pageGroup_idx" ON "VisitorEvent"("pageGroup");

-- CreateIndex
CREATE INDEX "VisitorEvent_normalizedPagePath_idx" ON "VisitorEvent"("normalizedPagePath");

-- CreateIndex
CREATE INDEX "VisitorEvent_normalizedPageHostname_idx" ON "VisitorEvent"("normalizedPageHostname");

-- CreateIndex
CREATE INDEX "VisitorEvent_occurredAt_pageGroup_idx" ON "VisitorEvent"("occurredAt", "pageGroup");

-- CreateIndex
CREATE INDEX "PageGroupRule_isActive_priority_idx" ON "PageGroupRule"("isActive", "priority");

-- CreateIndex
CREATE INDEX "PageGroupRule_groupName_idx" ON "PageGroupRule"("groupName");

-- SeedData
INSERT INTO "PageGroupRule" ("id", "name", "matchType", "pattern", "groupName", "priority", "isActive", "updatedAt")
VALUES
  ('default_services_page_group_rule', 'Services section', 'path_prefix', '/services', 'Services', 10, true, CURRENT_TIMESTAMP),
  ('default_products_page_group_rule', 'Products section', 'path_prefix', '/products', 'Products', 20, true, CURRENT_TIMESTAMP),
  ('default_solutions_page_group_rule', 'Solutions section', 'path_prefix', '/solutions', 'Solutions', 30, true, CURRENT_TIMESTAMP),
  ('default_blog_page_group_rule', 'Blog section', 'path_prefix', '/blog', 'Blog', 40, true, CURRENT_TIMESTAMP),
  ('default_case_studies_page_group_rule', 'Case studies section', 'path_prefix', '/case-studies', 'Case Studies', 50, true, CURRENT_TIMESTAMP),
  ('default_contact_page_group_rule', 'Contact section', 'path_prefix', '/contact', 'Contact', 60, true, CURRENT_TIMESTAMP),
  ('default_careers_page_group_rule', 'Careers section', 'path_prefix', '/careers', 'Careers', 70, true, CURRENT_TIMESTAMP),
  ('default_about_page_group_rule', 'About section', 'path_prefix', '/about', 'About', 80, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
