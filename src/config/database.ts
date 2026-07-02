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
        { emit: 'stdout', level: 'error' },
      ]
    : [
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
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

  return client;
};

// ─── Global Guard for Hot-Reload ─────────────────────────────────────────────

/**
 * Augment the NodeJS global type to include our Prisma instance.
 * This is a TypeScript pattern for "well-known" globals — better than
 * casting to `any`.
 */
declare global {
  // eslint-disable-next-line no-var
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
  await prisma.$queryRaw`SELECT 1`;
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
