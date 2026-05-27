export type IpinfoLiteResult = {
  ipinfoCountry?: string;
  ipinfoCountryCode?: string;
  ipinfoAsn?: string;
  ipinfoAsName?: string;
  ipinfoAsDomain?: string;
  ipinfoNetwork?: string;
};

type IpinfoLiteApiResponse = {
  country?: string;
  country_code?: string;
  asn?: string;
  as_name?: string;
  as_domain?: string;
  network?: string;
};

export async function lookupIpinfoLite(ip: string, token?: string): Promise<IpinfoLiteResult> {
  if (!token) {
    return {};
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'visitor-intelligence-api/1.0',
      },
    });

    if (!response.ok) {
      return {};
    }

    const json = await response.json() as IpinfoLiteApiResponse;

    return {
      ipinfoCountry: json.country,
      ipinfoCountryCode: json.country_code,
      ipinfoAsn: json.asn,
      ipinfoAsName: json.as_name,
      ipinfoAsDomain: json.as_domain,
      ipinfoNetwork: json.network,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}
