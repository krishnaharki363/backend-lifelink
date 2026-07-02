/**
 * @file env.ts
 * @description Centralized environment variable validation using Zod.
 *
 * WHY THIS EXISTS:
 * - process.env returns `string | undefined` for every key.
 * - Accessing undefined env vars causes silent bugs or cryptic runtime crashes.
 * - This module validates ALL required variables at startup and exports a
 *   fully-typed `env` object. If anything is missing or malformed, the
 *   process exits immediately with a descriptive error — not 30 minutes
 *   later when a feature is exercised in production.
 *
 * USAGE:
 *   import { env } from '@config/env';
 *   console.log(env.PORT); // number, guaranteed
 */

import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file before validation runs.
// In production (Render, Docker), env vars are injected directly
// by the platform, so dotenv is effectively a no-op there.
dotenv.config();

// ─── Schema Definition ──────────────────────────────────────────────────────

/**
 * Zod schema describing the exact shape and constraints of our environment.
 * Every field is explicitly typed — there is no `z.string()` without
 * further transformation where a different type is expected.
 */
const envSchema = z.object({
  // ── Node / Server ──────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test'], {
    errorMap: () => ({
      message: 'NODE_ENV must be one of: development, production, test',
    }),
  }),

  PORT: z
    .string()
    .min(1)
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(1024).max(65535)),

  API_VERSION: z.string().min(1).default('v1'),

  // ── Database ───────────────────────────────────────────────────────────
  // Pooled connection — used by Prisma at runtime (via PgBouncer)
  DATABASE_URL: z
    .string()
    .url({ message: 'DATABASE_URL must be a valid PostgreSQL connection string' })
    .startsWith('postgresql://', { message: 'DATABASE_URL must start with postgresql://' }),

  // Direct connection — used ONLY for Prisma CLI migrations
  DIRECT_URL: z
    .string()
    .url({ message: 'DIRECT_URL must be a valid PostgreSQL connection string' })
    .startsWith('postgresql://', { message: 'DIRECT_URL must start with postgresql://' }),

  // ── JWT ────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters for security' }),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters for security' }),

  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),

  // ── CORS ───────────────────────────────────────────────────────────────
  // Comma-separated list of allowed origins e.g. "http://localhost:3000,https://app.lifelink.com"
  ALLOWED_ORIGINS: z
    .string()
    .min(1)
    .transform((val) => val.split(',').map((origin) => origin.trim())),

  // ── Rate Limiting ──────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: z
    .string()
    .optional()
    .default('900000') // 15 minutes
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  RATE_LIMIT_MAX_REQUESTS: z
    .string()
    .optional()
    .default('100')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  // ── Email (Nodemailer) ─────────────────────────────────────────────────
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z
    .string()
    .optional()
    .default('587')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive()),

  SMTP_SECURE: z
    .string()
    .optional()
    .default('false')
    .transform((val) => val === 'true'),

  SMTP_USER: z.string().email({ message: 'SMTP_USER must be a valid email address' }),
  SMTP_PASS: z.string().min(1, { message: 'SMTP_PASS is required' }),
  EMAIL_FROM: z.string().min(1).default('LifeLink <noreply@lifelink.app>'),

  // ── Security ───────────────────────────────────────────────────────────
  BCRYPT_SALT_ROUNDS: z
    .string()
    .optional()
    .default('12')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().min(10).max(14)), // <10 is insecure, >14 is too slow

  // ── Logging ────────────────────────────────────────────────────────────
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional()
    .default('info'),
});

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Parse and validate process.env against the schema.
 * `safeParse` returns a result object — it does NOT throw on failure.
 * We inspect the result and handle errors ourselves for better DX.
 */
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Format Zod's error list into something human-readable
  const errors = parsed.error.errors
    .map((err) => `  ❌ ${err.path.join('.')} — ${err.message}`)
    .join('\n');

  // We intentionally use console.error here (not our logger) because
  // the logger itself hasn't been initialized yet.
  console.error('\n🔴 Environment validation failed. Fix the following:\n');
  console.error(errors);
  console.error('\n💡 Copy .env.example to .env and fill in all required values.\n');

  process.exit(1); // Exit with non-zero code so Docker/CI knows it failed
}

// ─── Export ─────────────────────────────────────────────────────────────────

/**
 * Fully validated, fully typed environment configuration.
 * Import this object anywhere in the app instead of accessing process.env directly.
 *
 * @example
 *   import { env } from '@config/env';
 *   const port = env.PORT; // type: number, guaranteed non-undefined
 */
export const env = parsed.data;

/**
 * Derived helpers — convenience booleans computed once.
 * Avoids repeating `env.NODE_ENV === 'production'` everywhere.
 */
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// TypeScript type inference — gives us the exact shape of our config
export type Env = typeof env;
