-- Seed singular product page grouping for /product/... URLs.
INSERT INTO "PageGroupRule" ("id", "name", "matchType", "pattern", "groupName", "priority", "isActive", "updatedAt")
VALUES ('default_product_page_group_rule', 'Product section', 'path_prefix', '/product', 'Products', 21, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET
  "pattern" = EXCLUDED."pattern",
  "groupName" = EXCLUDED."groupName",
  "priority" = EXCLUDED."priority",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = CURRENT_TIMESTAMP;

-- Update product URL regex to support both /product/... and /products/... paths.
UPDATE "UrlGroupRule"
SET "pattern" = '^/products?/.*$',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default_products_url_group_rule';

-- Repair existing normalized page-level events that were grouped before this rule existed.
UPDATE "VisitorEvent"
SET "pageGroup" = 'Products',
    "pageGroupSource" = 'migration:path_prefix:/product'
WHERE "normalizedPagePath" LIKE '/product/%';

-- Repair existing session-level landing/exit groups for singular product URLs.
UPDATE "VisitSession"
SET "landedUrlGroup" = 'Products',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "landedUrlPath" LIKE '/product/%';

UPDATE "VisitSession"
SET "exitUrlGroup" = 'Products',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "exitUrlPath" LIKE '/product/%';
