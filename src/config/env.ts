import path from 'node:path';

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  ingestApiKey: string;
  dashboardApiKey: string;
  ipHashSecret: string;
  storeRawIp: boolean;
  maxmindCityDbPath: string;
  maxmindAsnDbPath: string;
  ipinfoToken?: string;
  ipCacheTtlDays: number;
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindow: string;
  enableRdapLookup: boolean;
};

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function bool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
}

function numberValue(name: string, defaultValue: number): number {
  const raw = process.env[name];

  if (!raw) {
    return defaultValue;
  }

  const parsed = Number(raw);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return parsed;
}

function resolvePath(value: string): string {
  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(process.cwd(), value);
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: (process.env.NODE_ENV || 'development') as AppConfig['nodeEnv'],
    host: process.env.HOST || '0.0.0.0',
    port: numberValue('PORT', 3000),

    ingestApiKey: required('INGEST_API_KEY'),
    dashboardApiKey: required('DASHBOARD_API_KEY'),
    ipHashSecret: required('IP_HASH_SECRET'),

    storeRawIp: bool('STORE_RAW_IP', false),

    maxmindCityDbPath: resolvePath(process.env.MAXMIND_CITY_DB_PATH || './geoip/GeoLite2-City.mmdb'),
    maxmindAsnDbPath: resolvePath(process.env.MAXMIND_ASN_DB_PATH || './geoip/GeoLite2-ASN.mmdb'),

    ipinfoToken: process.env.IPINFO_TOKEN || undefined,
    ipCacheTtlDays: numberValue('IP_CACHE_TTL_DAYS', 7),

    corsOrigins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),

    rateLimitMax: numberValue('RATE_LIMIT_MAX', 300),
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
    enableRdapLookup: bool('ENABLE_RDAP_LOOKUP', true),
  };
}
