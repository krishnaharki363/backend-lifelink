/**
 * @file config/index.ts
 * @description Barrel export for the config module.
 *
 * WHY A BARREL FILE?
 * Instead of writing:
 *   import { env } from '@config/env';
 *   import { logger } from '@config/logger';
 *   import { prisma } from '@config/database';
 *
 * You can write:
 *   import { env, logger, prisma } from '@config';
 *
 * This keeps import statements clean and makes refactoring easier
 * — if we move a file, we only update the barrel, not every importer.
 */

export * from './env';
export * from './logger';
export * from './database';
