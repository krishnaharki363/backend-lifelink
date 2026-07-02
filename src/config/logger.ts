/**
 * @file logger.ts
 * @description Centralized Pino structured logger.
 *
 * WHY PINO OVER CONSOLE.LOG?
 * - `console.log` outputs unstructured strings. Impossible to query in prod.
 * - Pino outputs JSON: { "level": "info", "msg": "...", "timestamp": "..." }
 * - Tools like Datadog, Grafana Loki, and AWS CloudWatch can index JSON logs,
 *   letting you run queries like: `level:error AND service:lifelink`
 * - Pino is the fastest Node.js logger (benchmarked: 5x faster than Winston).
 *
 * WHY A SINGLETON?
 * - All modules import the same logger instance, so log level changes
 *   propagate everywhere without restarting.
 * - Child loggers (logger.child({ requestId })) automatically inherit
 *   parent bindings — useful for tracing a single request across services.
 *
 * USAGE:
 *   import { logger } from '@config/logger';
 *   logger.info('Server started');
 *   logger.error({ err, userId }, 'Failed to process request');
 */

import pino from 'pino';
import { env, isDevelopment } from '@config/env';

// ─── Transport Configuration ────────────────────────────────────────────────

/**
 * In development: use pino-pretty for human-readable colorized output.
 * In production: raw JSON (faster, no color codes, ingestible by log platforms).
 *
 * This is a crucial distinction — never ship pino-pretty to production.
 * It adds significant overhead and pollutes JSON with ANSI escape codes.
 */
const transport = isDevelopment
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageFormat: '🔗 [{context}] {msg}',
        errorLikeObjectKeys: ['err', 'error'],
      },
    })
  : undefined; // Production: use Pino's default JSON output to stdout

// ─── Logger Instance ────────────────────────────────────────────────────────

/**
 * The global logger instance.
 *
 * Configuration notes:
 * - `level`: Controlled by LOG_LEVEL env var. In production, set to 'info'
 *   or 'warn' to avoid logging verbose debug output.
 * - `base`: We add `service` to every log line so it's visible when logs
 *   from multiple services are aggregated (e.g., in a microservices setup).
 * - `redact`: CRITICAL for security — automatically redacts sensitive fields
 *   before they reach log output. Prevents secrets leaking into log files.
 * - `serializers`: Custom formatting for Error objects — ensures `stack`
 *   traces are included and structured correctly.
 */
export const logger = pino(
  {
    level: env.LOG_LEVEL,

    // Static fields added to every log entry
    base: {
      service: 'lifelink-backend',
      environment: env.NODE_ENV,
    },

    // Redact sensitive fields — they are replaced with '[Redacted]'
    // IMPORTANT: update this list if you add new sensitive fields
    redact: {
      paths: [
        'password',
        'passwordHash',
        'token',
        'accessToken',
        'refreshToken',
        'authorization',
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.currentPassword',
        'body.newPassword',
      ],
      censor: '[Redacted]',
    },

    // Custom timestamp format — ISO 8601 with milliseconds
    timestamp: pino.stdTimeFunctions.isoTime,

    // Structured error serializer — includes stack traces properly
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
  },
  transport,
);

// ─── Child Logger Factory ────────────────────────────────────────────────────

/**
 * Creates a child logger bound to a specific module or context.
 *
 * Child loggers inherit all parent settings but add extra fields
 * to every log line they produce. This makes it trivially easy to
 * filter logs by context in a log aggregation platform.
 *
 * @example
 *   // In auth.service.ts
 *   const log = createContextLogger('AuthService');
 *   log.info('User logged in'); // logs: { context: 'AuthService', msg: 'User logged in' }
 */
export const createContextLogger = (context: string): pino.Logger => {
  return logger.child({ context });
};

export type Logger = typeof logger;
