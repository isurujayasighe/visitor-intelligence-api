import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from './env';

export function createLoggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.nodeEnv === 'development') {
    return {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return {
    level: 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.ip_address',
        'body.user_agent',
      ],
      remove: true,
    },
  };
}
