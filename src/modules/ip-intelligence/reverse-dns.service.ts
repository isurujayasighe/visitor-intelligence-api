import dns from 'node:dns/promises';

export async function lookupReverseDns(ip: string): Promise<string | null> {
  try {
    const hostnames = await dns.reverse(ip);
    return hostnames[0] || null;
  } catch {
    return null;
  }
}
