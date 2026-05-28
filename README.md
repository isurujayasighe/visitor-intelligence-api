# Visitor Intelligence Fastify API

Production-ready starter API for:

```text
Server GTM
  -> Fastify ingest endpoint
  -> IP normalization
  -> MaxMind GeoLite2 City + ASN
  -> Reverse DNS + RDAP fallback
  -> PostgreSQL storage
  -> Marketing dashboard APIs
```

## Why this approach

CSV is fine for a proof of concept, but a marketing dashboard needs filtering, grouping, time ranges, top companies, top pages, and export/reporting. PostgreSQL makes that much easier.

## Folder structure

```text
src/
  app.ts
  main.ts
  config/
  plugins/
  modules/
    ingest/
    dashboard/
    page-intelligence/
    ip-intelligence/
  shared/
prisma/
  schema.prisma
geoip/
  GeoLite2-City.mmdb
  GeoLite2-ASN.mmdb
```

## Setup

```bash
npm install
cp .env.example .env
```

Update `.env`.

Download MaxMind GeoLite2 databases and place:

```text
geoip/GeoLite2-City.mmdb
geoip/GeoLite2-ASN.mmdb
```

Run DB migration:

```bash
npx prisma migrate dev --name init
npm run dev
```

## API docs

Swagger UI is available when the server is running:

```text
http://localhost:3000/docs
http://localhost:3000/docs/json
```

## Server GTM endpoint

```text
POST /api/v1/ingest/visitor-event
Authorization: Bearer <INGEST_API_KEY>
Content-Type: application/json
```

Sample body:

```json
{
  "ip_address": "112.134.173.110:5875",
  "page_url": "https://www.companysite.com/",
  "page_hostname": "www.companysite.com",
  "page_path": "/",
  "page_title": "Home",
  "user_agent": "Mozilla/5.0",
  "event_name": "page_view",
  "referrer": "https://www.google.com/",
  "client_id": "1234567890.987654321",
  "utm_source": "google",
  "utm_medium": "organic",
  "utm_campaign": ""
}
```

Recommended Server GTM payload:

```json
{
  "ip_address": "{{Request Header - X-Forwarded-For}}",
  "page_url": "{{Event Data - page_location}}",
  "page_hostname": "{{Event Data - page_hostname}}",
  "page_path": "{{Event Data - page_path}}",
  "page_title": "{{Event Data - page_title}}",
  "user_agent": "{{Event Data - user_agent}}",
  "event_name": "{{Event Data - event_name}}",
  "session_id": "{{Event Data - ga_session_id}}",
  "event_timestamp": "{{Event Data - event_timestamp}}",
  "referrer": "{{Event Data - page_referrer}}",
  "client_id": "{{Event Data - client_id}}",
  "utm_source": "{{Event Data - utm_source}}",
  "utm_medium": "{{Event Data - utm_medium}}",
  "utm_campaign": "{{Event Data - utm_campaign}}"
}
```

Page normalization uses `page_url` first, then `page_path`, then `referrer` as a fallback. If only the referrer is available, the API still derives a normalized page path and business section where possible.

Visit session tracking also uses `session_id` when available. If it is missing, the API creates a fallback session key from `ipHash + clientId + 30-minute time bucket`, so ingest does not fail.

Fallback sample:

```json
{
  "ip_address": "103.21.166.142:50516",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  "event_name": "page_view",
  "referrer": "https://covalentworld.com/services/business-strategy-assignment/",
  "page_title": "IFS Outlook Integration For Work Orders & Scheduling | TaskSync",
  "page_path": ""
}
```

Expected normalized fields:

```text
normalizedPagePath = /services/business-strategy-assignment/
pageGroup = Services
pageSlug = services-business-strategy-assignment
```

## Dashboard APIs

Use:

```text
Authorization: Bearer <DASHBOARD_API_KEY>
```

Endpoints:

```text
GET /api/v1/dashboard/summary?from=2026-05-01&to=2026-05-27
GET /api/v1/dashboard/top-companies?from=2026-05-01&to=2026-05-27
GET /api/v1/dashboard/top-pages?from=2026-05-01&to=2026-05-27
GET /api/v1/dashboard/visited-pages-grouped?from=2026-05-01&to=2026-05-27&limitGroups=25&limitPagesPerGroup=20
GET /api/v1/dashboard/page-group-rules
GET /api/v1/dashboard/recent-visits?limit=50
GET /api/v1/dashboard/ip-intelligence?limit=100
GET /api/v1/dashboard/visit-sessions?from=2026-05-01&to=2026-05-27&limit=50&offset=0
GET /api/v1/dashboard/visit-sessions/summary?from=2026-05-01&to=2026-05-27
GET /api/v1/dashboard/url-group-rules
```

List endpoints support pagination with `page` and `pageSize`. The frontend defaults to `pageSize=20`.

```text
GET /api/v1/dashboard/recent-visits?page=1&pageSize=20
GET /api/v1/dashboard/ip-intelligence?page=1&pageSize=20
GET /api/v1/dashboard/top-companies?from=2026-05-01&to=2026-05-27&page=1&pageSize=20
GET /api/v1/dashboard/top-pages?from=2026-05-01&to=2026-05-27&page=1&pageSize=20
GET /api/v1/dashboard/visited-pages-grouped?from=2026-05-01&to=2026-05-27&page=1&pageSize=20
```

When `page` or `pageSize` is included, responses use:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 0,
    "total_pages": 1
  }
}
```

Existing non-paginated calls continue returning the original array shape for backward compatibility.

Visit session filters:

```text
ip
country
landedUrlGroup
exitUrlGroup
minDurationSeconds
maxDurationSeconds
from
to
limit
offset
```

URL grouping rules are regex-based and ordered by ascending `priority`. Default active groups are:

```text
Core services
Advisory services
Products
Other pages
```

To backfill sessions from existing page-level `VisitorEvent` records:

```bash
npm run backfill:visit-sessions
```

## Azure App Service

Azure App Service passes the runtime port via `process.env.PORT`; this API uses that value automatically.

Startup command:

```bash
npm run start
```

Deployment build:

```bash
npm install
npx prisma generate
npm run build
npx prisma migrate deploy
```

## Privacy

IP addresses may be considered personal data depending on jurisdiction. For safer long-term reporting:

- Set `STORE_RAW_IP=false`
- Keep `ipHash` for deduplication
- Store only country, region, city, ASN, network, and company guess
- Visit session dashboards return raw IP only when `STORE_RAW_IP=true`; otherwise they show `hidden`/IP hash fallback.
- Add a retention job later for old raw visitor events
- Do not send raw IP to GA4 custom dimensions
