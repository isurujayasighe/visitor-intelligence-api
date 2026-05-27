# Azure App Service notes

## Required app settings

```text
NODE_ENV=production
PORT=8080
DATABASE_URL=...
INGEST_API_KEY=...
DASHBOARD_API_KEY=...
IP_HASH_SECRET=...
STORE_RAW_IP=false
MAXMIND_CITY_DB_PATH=/home/site/wwwroot/geoip/GeoLite2-City.mmdb
MAXMIND_ASN_DB_PATH=/home/site/wwwroot/geoip/GeoLite2-ASN.mmdb
CORS_ORIGINS=https://your-dashboard-domain.com
ENABLE_RDAP_LOOKUP=true
```

## Startup command

```bash
npm run start
```

## Deployment steps

```bash
npm install
npx prisma generate
npm run build
npx prisma migrate deploy
```

For container deployment, use the included Dockerfile.
