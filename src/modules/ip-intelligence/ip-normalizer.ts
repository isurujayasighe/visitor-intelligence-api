import net from 'node:net';

function normalizeIpToken(value: string): string {
  let token = String(value || '').trim();

  if (!token) {
    return '';
  }

  token = token.replace(/^["']|["']$/g, '').trim();

  if (token.toLowerCase().startsWith('for=')) {
    token = token.slice(4).replace(/^["']|["']$/g, '').trim();
  }

  // IPv6 with port: [2001:db8::1]:443
  const bracketIpv6 = token.match(/^\[([0-9a-fA-F:]+)](?::\d+)?$/);
  if (bracketIpv6) {
    return bracketIpv6[1];
  }

  // IPv4 with port: 112.134.173.110:5875
  const ipv4WithPort = token.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort) {
    return ipv4WithPort[1];
  }

  return token;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    const [a, b] = parts;

    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 127 ||
      a === 0 ||
      a >= 224 ||
      (a === 169 && b === 254)
    );
  }

  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:')
    );
  }

  return true;
}

export function extractPublicIp(value: unknown): string | null {
  const forwardedFor = String(value || '');

  if (!forwardedFor) {
    return null;
  }

  const parts = forwardedFor.split(',');

  for (const part of parts) {
    const ip = normalizeIpToken(part);

    if (net.isIP(ip) && !isPrivateOrReservedIp(ip)) {
      return ip;
    }
  }

  for (const part of parts) {
    const ip = normalizeIpToken(part);

    if (net.isIP(ip)) {
      return ip;
    }
  }

  return null;
}
