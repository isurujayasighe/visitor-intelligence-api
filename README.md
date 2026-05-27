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
GET /api/v1/dashboard/recent-visits?limit=50
GET /api/v1/dashboard/ip-intelligence?limit=100
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
- Add a retention job later for old raw visitor events
- Do not send raw IP to GA4 custom dimensions
