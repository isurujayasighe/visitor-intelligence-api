import fs from 'node:fs';
import { Reader } from '@maxmind/geoip2-node';
import type { AppConfig } from '../../config/env';

type ReaderModel = Awaited<ReturnType<typeof Reader.open>>;

export type GeoLookupResult = {
  country?: string;
  countryCode?: string;
  region?: string;
  regionCode?: string;
  city?: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  accuracyRadius?: number;
  timezone?: string;
  geoSource?: string;

  asn?: string;
  asName?: string;
  asnNetwork?: string;
  asnSource?: string;
};

export class MaxMindService {
  constructor(
    private readonly cityReader: ReaderModel | null,
    private readonly asnReader: ReaderModel | null,
  ) {}

  status() {
    return {
      cityDbLoaded: Boolean(this.cityReader),
      asnDbLoaded: Boolean(this.asnReader),
    };
  }

  city(ip: string): Partial<GeoLookupResult> {
    if (!this.cityReader) {
      return {};
    }

    try {
      const response = this.cityReader.city(ip);

      return {
        country: response.country?.names?.en || response.country?.isoCode,
        countryCode: response.country?.isoCode,
        region: response.subdivisions?.[0]?.names?.en,
        regionCode: response.subdivisions?.[0]?.isoCode,
        city: response.city?.names?.en,
        postalCode: response.postal?.code,
        latitude: response.location?.latitude,
        longitude: response.location?.longitude,
        accuracyRadius: response.location?.accuracyRadius,
        timezone: response.location?.timeZone,
        geoSource: 'maxmind_city',
      };
    } catch {
      return {};
    }
  }

  asn(ip: string): Partial<GeoLookupResult> {
    if (!this.asnReader) {
      return {};
    }

    try {
      const response = this.asnReader.asn(ip);
      const asnNumber = response.autonomousSystemNumber;

      return {
        asn: asnNumber ? `AS${asnNumber}` : undefined,
        asName: response.autonomousSystemOrganization,
        asnNetwork: response.network,
        asnSource: 'maxmind_asn',
      };
    } catch {
      return {};
    }
  }

  lookup(ip: string): GeoLookupResult {
    return {
      ...this.city(ip),
      ...this.asn(ip),
    };
  }

  close(): void {
    // ReaderModel does not require explicit closing in normal usage.
  }
}

export async function createMaxMindService(config: AppConfig): Promise<MaxMindService> {
  const cityReader = fs.existsSync(config.maxmindCityDbPath)
    ? await Reader.open(config.maxmindCityDbPath)
    : null;

  const asnReader = fs.existsSync(config.maxmindAsnDbPath)
    ? await Reader.open(config.maxmindAsnDbPath)
    : null;

  return new MaxMindService(cityReader, asnReader);
}
