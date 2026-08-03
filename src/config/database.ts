/**
 * @file database.ts
 * @description Prisma Client singleton for database access.
 *
 * WHY A SINGLETON?
 * Node.js modules are cached after the first `require/import`.
 * But in development, `tsx watch` reloads modules on file changes.
 * Without the global guard below, each hot-reload creates a NEW PrismaClient
 * instance with its own connection pool — leading to connection exhaustion
 * in Neon's serverless PostgreSQL (which has a limit of ~10 connections).
 *
 * The pattern below:
 * 1. In production: simply exports a single PrismaClient (module caching handles it).
 * 2. In development: attaches the client to `globalThis` so hot-reloads
 *    reuse the existing instance instead of creating new ones.
 *
 * This exact pattern is recommended in the official Prisma + Next.js docs
 * and is battle-tested in large production applications.
 *
 * WHY LOG QUERIES IN DEVELOPMENT?
 * - Seeing the exact SQL Prisma generates helps you understand what your
 *   ORM is doing under the hood — critical for diagnosing N+1 query problems.
 * - In production, query logging is disabled to avoid leaking data into logs.
 *
 * USAGE:
 *   import { prisma } from '@config/database';
 *   const users = await prisma.user.findMany();
 */

import { PrismaClient } from '@prisma/client';
import { env, isDevelopment, isTest } from '@config/env';
import { createContextLogger } from '@config/logger';

const log = createContextLogger('Database');

// ─── Prisma Log Levels ───────────────────────────────────────────────────────

/**
 * Configure Prisma's internal logging based on the current environment.
 *
 * - `query`: Logs every SQL query with parameters (dev only — too verbose for prod)
 * - `info`: Prisma lifecycle events (connection opened, etc.)
 * - `warn`: Deprecation warnings and slow queries
 * - `error`: Database errors
 *
 * We use `emit: 'event'` for queries so we can pipe them through Pino
 * instead of letting Prisma print directly to stdout in its own format.
 */
const prismaLogConfig: ConstructorParameters<typeof PrismaClient>[0] = {
  log: isDevelopment
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        // Use 'event' so we can filter benign Neon idle-close noise
        { emit: 'event', level: 'error' },
      ]
    : [
        { emit: 'stdout', level: 'warn' },
        // Use 'event' so we can filter benign Neon idle-close noise
        { emit: 'event', level: 'error' },
      ],
  // Neon free tier allows ~10 connections; keep the pool small.
  // The pooler URL (pgbouncer=true) already handles multiplexing.
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
};

// ─── Singleton Factory ───────────────────────────────────────────────────────

/**
 * Creates a new PrismaClient and attaches query event listeners in development.
 */
const createPrismaClient = (): PrismaClient => {
  const client = new PrismaClient(prismaLogConfig);

  // In development, pipe Prisma's query events through our Pino logger
  // so all logs have the same structured format.
  if (isDevelopment) {
    // @ts-expect-error — Prisma's $on types are only available when log emit:'event' is configured
    client.$on('query', (event: { query: string; params: string; duration: number }) => {
      log.debug(
        {
          query: event.query,
          params: event.params,
          duration: `${event.duration}ms`,
        },
        'Prisma Query',
      );
    });
  }

  // Intercept Prisma error events to filter out benign Neon serverless noise.
  //
  // WHY FILTER?
  // Neon closes idle connections after a short timeout. When this happens,
  // Prisma logs "Error { kind: Closed, cause: None }" or the E57P01 message.
  // These are NOT real errors — Prisma reconnects automatically on the next
  // query. Printing them as errors is misleading and clutters the logs.
  //
  // We downgrade them to debug so they're invisible in production but
  // available when LOG_LEVEL=debug for deep troubleshooting.
  // @ts-expect-error — $on('error') types require emit:'event' to be set
  client.$on('error', (event: { message: string; target: string }) => {
    const msg = event.message ?? '';
    const isNeonIdleClose =
      msg.includes('kind: Closed') ||
      msg.includes('terminating connection') ||
      msg.includes('E57P01');

    if (isNeonIdleClose) {
      // Expected Neon serverless behaviour — downgrade to debug
      log.debug(
        { target: event.target },
        'Neon closed idle connection (Prisma will reconnect automatically)',
      );
    } else {
      // Genuine unexpected database error — keep at error level
      log.error({ message: msg, target: event.target }, 'Prisma database error');
    }
  });

  return client;
};

// ─── Global Guard for Hot-Reload ─────────────────────────────────────────────

/**
 * Augment the NodeJS global type to include our Prisma instance.
 * This is a TypeScript pattern for "well-known" globals — better than
 * casting to `any`.
 */
declare global {
   
  var __prisma: PrismaClient | undefined;
}

/**
 * The Prisma Client singleton.
 *
 * - In production/test: a fresh instance (module cache prevents duplicates).
 * - In development: reuses the instance stored on `globalThis` to survive
 *   hot-reloads without exhausting the database connection pool.
 */
export const prisma: PrismaClient = (() => {
  if (isTest || env.NODE_ENV === 'production') {
    // In production/test, module caching is reliable — just create once.
    return createPrismaClient();
  }

  // Development: use global cache to survive tsx watch hot-reloads
  if (!globalThis.__prisma) {
    globalThis.__prisma = createPrismaClient();
    log.info('Prisma Client initialized (development mode)');
  }

  return globalThis.__prisma;
})();

// ─── Connection Health Check ──────────────────────────────────────────────────

/**
 * Verifies the database connection is alive.
 * Used at server startup and in the health check endpoint.
 *
 * `$queryRaw` executes a raw SQL query — `SELECT 1` is the lightest
 * possible query that proves the connection works end-to-end.
 *
 * @throws {Error} If the database is unreachable
 */
export const checkDatabaseConnection = async (): Promise<void> => {
  // Neon serverless can drop connections on cold start (E57P01).
  // Retry once to allow the compute to wake up before giving up.
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: unknown) {
    const isTerminated =
      err instanceof Error && err.message.includes('terminating connection');
    if (isTerminated) {
      log.warn('Neon connection terminated — retrying after brief pause...');
      await new Promise((r) => setTimeout(r, 1500));
      await prisma.$queryRaw`SELECT 1`;
    } else {
      throw err;
    }
  }
};

/**
 * Gracefully closes the Prisma connection pool.
 * Called during graceful shutdown to allow in-flight queries to complete.
 *
 * @see server.ts for how this is wired into process signal handlers
 */
export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  log.info('Database connection closed');
};
