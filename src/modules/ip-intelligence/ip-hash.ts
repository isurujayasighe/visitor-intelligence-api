import crypto from 'node:crypto';

export function createIpHash(ip: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(ip).digest('hex');
}
