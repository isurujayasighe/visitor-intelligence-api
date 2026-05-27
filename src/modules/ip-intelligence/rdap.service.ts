export type RdapResult = {
  rdapName?: string;
  rdapEntity?: string;
  rdapHandle?: string;
};

type RdapApiResponse = {
  name?: string;
  handle?: string;
  entities?: unknown[];
};

function extractRdapEntityName(rdap: any): string | undefined {
  const entities = Array.isArray(rdap?.entities) ? rdap.entities : [];

  for (const entity of entities) {
    const vcardRows = entity?.vcardArray?.[1];

    if (!Array.isArray(vcardRows)) {
      continue;
    }

    for (const row of vcardRows) {
      if (Array.isArray(row) && row[0] === 'fn') {
        return row[3];
      }
    }
  }

  return undefined;
}

export async function lookupRdap(ip: string): Promise<RdapResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'visitor-intelligence-api/1.0',
      },
    });

    if (!response.ok) {
      return {};
    }

    const json = await response.json() as RdapApiResponse;

    return {
      rdapName: json.name,
      rdapHandle: json.handle,
      rdapEntity: extractRdapEntityName(json),
    };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}
