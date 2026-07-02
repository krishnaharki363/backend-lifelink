/**
 * @file requestLogger.ts
 * @description HTTP request/response logging middleware using pino-http.
 *
 * WHY pino-http AND NOT A CUSTOM LOGGER?
 * `pino-http` is purpose-built for Express HTTP logging. It automatically:
 * - Assigns a unique request ID to every request (traceable across all logs)
 * - Measures and logs response time in milliseconds
 * - Logs request method, URL, status code, and content-length
 * - Attaches the request ID to `req.log` — so you can use it in route handlers
 *   to log messages that are automatically correlated to the HTTP request.
 *
 * WHY ATTACH A REQUEST ID?
 * When 1000 requests hit the server concurrently, logs interleave.
 * Without a request ID, it's impossible to trace the full lifecycle
 * of any single request. With an ID:
 *   { "reqId": "abc123", "msg": "User authenticated" }
 *   { "reqId": "abc123", "msg": "Blood request created" }
 *   { "reqId": "abc123", "msg": "Request completed", "responseTime": 45 }
 *
 * All three lines belong to the same request — instantly filterable.
 *
 * USAGE:
 *   import { requestLogger } from '@middleware/requestLogger';
 *   app.use(requestLogger);
 */

import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from '@config/logger';
import { isDevelopment } from '@config/env';

export const requestLogger = pinoHttp({
  // Use the same Pino logger instance we configured globally.
  // This means request logs flow through the same transport
  // (pino-pretty in dev, JSON in prod) as application logs.
  logger,

  // Generate a unique request ID using the built-in crypto module.
  // UUID v4 is collision-proof for all practical purposes.
  genReqId: (req, res) => {
    // Honour any upstream request ID (e.g., from a load balancer or API gateway)
    const existingId = req.headers['x-request-id'] as string | undefined;
    const id = existingId ?? randomUUID();
    // Echo the request ID back in the response header for client-side tracing
    res.setHeader('X-Request-Id', id);
    return id;
  },

  // Customize what gets logged for each request.
  customReceivedMessage: (req) => {
    return `→ ${req.method} ${req.url}`;
  },

  customSuccessMessage: (req, res) => {
    return `← ${req.method} ${req.url} ${res.statusCode}`;
  },

  customErrorMessage: (req, res, err) => {
    return `← ${req.method} ${req.url} ${res.statusCode} — ${err.message}`;
  },

  // Customize the log level per status code range.
  customLogLevel: (_req, res, err) => {
    if (err !== undefined || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  // Redact sensitive headers before logging
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[Redacted]',
  },

  // In development, log everything; in production skip health check noise
  autoLogging: isDevelopment
    ? true
    : {
        ignore: (req) => req.url === '/api/v1/health',
      },
});
