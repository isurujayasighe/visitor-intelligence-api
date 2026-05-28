-- Expand Core services URL regex to include /services/application-managed-support/.
UPDATE "UrlGroupRule"
SET "pattern" = '^/services/(ifs|ifs-applications|integration|implementation|support|managed-services|application-managed-support|managed-support|outlook-integration|work-orders|scheduling).*$',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default_core_services_url_group_rule';

-- Repair existing session-level landing/exit groups for this Core services page.
UPDATE "VisitSession"
SET "landedUrlGroup" = 'Core services',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "landedUrlPath" LIKE '/services/application-managed-support/%';

UPDATE "VisitSession"
SET "exitUrlGroup" = 'Core services',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "exitUrlPath" LIKE '/services/application-managed-support/%';
