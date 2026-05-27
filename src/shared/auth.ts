import type { FastifyRequest } from 'fastify';

export function getBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization || '';

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (match) {
    return match[1].trim();
  }

  const apiKeyHeader = request.headers['x-api-key'];

  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  return '';
}

export function requireApiKey(request: FastifyRequest, expectedApiKey: string): void {
  const provided = getBearerToken(request);

  if (!expectedApiKey || provided !== expectedApiKey) {
    const error = new Error('Unauthorized') as Error & { statusCode: number };
    error.statusCode = 401;
    throw error;
  }
}
