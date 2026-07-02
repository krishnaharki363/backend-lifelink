/**
 * @file app.ts
 * @description Express application factory — configures and returns the app.
 *
 * WHY SEPARATE app.ts FROM server.ts?
 * This is one of the most important architectural decisions in any Express project.
 *
 * app.ts  → Creates and configures the Express app. No port binding.
 * server.ts → Imports the app and binds it to a port.
 *
 * BENEFIT 1 — TESTABILITY:
 * Integration tests (Supertest) import `app` directly and make HTTP calls
 * without starting a real server. No port conflicts between test workers.
 *
 *   import app from './app';
 *   const response = await request(app).get('/api/v1/health');
 *
 * BENEFIT 2 — SEPARATION OF CONCERNS:
 * The app doesn't know or care about ports, process signals, or cluster workers.
 * server.ts handles all that. If you move to serverless (AWS Lambda, Vercel),
 * you only change server.ts — app.ts stays identical.
 *
 * MIDDLEWARE REGISTRATION ORDER:
 * Order matters in Express. Each request flows through middleware top-to-bottom.
 * Our order follows security best practices:
 *
 *   1. requestLogger  → Log the incoming request first (captures everything)
 *   2. helmet         → Set security headers (before any content is sent)
 *   3. cors           → Handle CORS preflight (before rate limiting hits OPTIONS)
 *   4. globalLimiter  → Rate limit (before any processing happens)
 *   5. compression    → Compress responses (after routing, before sending)
 *   6. cookieParser   → Parse cookies (needed before body parsing)
 *   7. express.json   → Parse JSON bodies (needed before controllers)
 *   8. Routes         → Actual business logic
 *   9. notFoundHandler → Catch unmatched routes (after all routes)
 *  10. errorHandler   → Catch all errors (must be last)
 */

import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { env } from '@config/env';
import { swaggerSpec } from '@config/swagger';
import { requestLogger } from '@middleware/requestLogger';
import { globalLimiter } from '@middleware/rateLimiter';
import { notFoundHandler } from '@middleware/notFoundHandler';
import { errorHandler } from '@middleware/errorHandler';
import apiV1Router from '@routes/index';

// ─── App Factory ─────────────────────────────────────────────────────────────

const createApp = (): Application => {
  const app = express();

  // ── 1. Request Logger ───────────────────────────────────────────────────
  // Must be first — logs every request including those that get rate-limited
  // or rejected by CORS. Gives a complete picture of all traffic.
  app.use(requestLogger);

  // ── 2. Security Headers (Helmet) ────────────────────────────────────────
  // Helmet sets ~15 HTTP security headers in one call.
  // Key headers it adds:
  //   Content-Security-Policy   → Prevents XSS attacks
  //   X-Frame-Options           → Prevents clickjacking (DENY by default)
  //   X-Content-Type-Options    → Prevents MIME sniffing (nosniff)
  //   Referrer-Policy           → Controls referrer information leakage
  //   Strict-Transport-Security → Forces HTTPS (HSTS)
  //   X-DNS-Prefetch-Control    → Controls browser DNS prefetching
  app.use(
    helmet({
      // Content Security Policy — restricts what resources can be loaded.
      // For a pure API (no frontend), we use a strict policy.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline required for Swagger UI
          styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline required for Swagger UI
          imgSrc: ["'self'", 'data:', 'validator.swagger.io'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      // Cross-Origin-Embedder-Policy — required for SharedArrayBuffer
      // Disabled because it can break some legitimate cross-origin requests
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ── 3. CORS ─────────────────────────────────────────────────────────────
  // Cross-Origin Resource Sharing — controls which domains can call our API.
  // Origins are loaded from the ALLOWED_ORIGINS env var (comma-separated list).
  //
  // The origin function is called for EVERY request.
  // It checks if the request's Origin header is in our allowlist.
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, server-to-server)
        if (!origin) {
          callback(null, true);
          return;
        }

        // Always allow Swagger UI to make requests to the API (same origin)
        const isSameOrigin = origin === `http://localhost:${env.PORT}` || origin === `http://127.0.0.1:${env.PORT}`;

        if (isSameOrigin || env.ALLOWED_ORIGINS.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: Origin '${origin}' is not allowed`));
        }
      },

      // Allow cookies and Authorization headers in cross-origin requests.
      // Required for our JWT refresh token flow (stored in httpOnly cookies).
      credentials: true,

      // Preflight cache — browsers cache OPTIONS responses for this many seconds.
      // 24 hours avoids repeated OPTIONS requests for the same endpoint.
      maxAge: 86400,

      // Expose these headers to the browser JavaScript
      exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining'],

      // Allow these HTTP methods
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

      // Allow these headers in requests
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    }),
  );

  // ── 4. Global Rate Limiter ──────────────────────────────────────────────
  // Applied after CORS so OPTIONS preflight requests pass through.
  // Applied before body parsing so abusive requests don't waste CPU.
  app.use(`/api/${env.API_VERSION}`, globalLimiter);

  // ── 5. Compression ──────────────────────────────────────────────────────
  // Compresses response bodies using gzip/deflate.
  // Reduces bandwidth by ~70% for JSON responses.
  // Automatically skips small responses (< 1kb) where compression overhead > savings.
  app.use(compression());

  // ── 6. Cookie Parser ────────────────────────────────────────────────────
  // Parses Cookie header into req.cookies object.
  // Required for our JWT refresh token strategy (stored in httpOnly cookies).
  app.use(cookieParser());

  // ── 7. Body Parsers ─────────────────────────────────────────────────────
  // Parse JSON request bodies → populates req.body
  // limit: 10mb — generous for blood request payloads with optional metadata,
  // but prevents request body bombing attacks (someone sending 2GB of JSON).
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded bodies (HTML form submissions)
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ── 8. Trust Proxy ──────────────────────────────────────────────────────
  // Required when running behind a reverse proxy (Nginx, Render, AWS ALB).
  // Without this, req.ip returns the proxy's IP, not the client's IP.
  // This affects rate limiting (everyone appears to come from the same IP)
  // and security logging.
  //
  // Value of 1 means "trust the first proxy in the chain".
  // In production behind Render/Railway/Heroku, this is correct.
  app.set('trust proxy', 1);

  // ── 9. API Documentation (Swagger) ──────────────────────────────────────
  // We place this BEFORE API routes so it doesn't get version-prefixed
  // It will be accessible at http://localhost:PORT/api-docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

  // ── 10. API Routes ───────────────────────────────────────────────────────
  // All versioned API routes are mounted here.
  // The router handles further sub-routing internally.
  app.use(`/api/${env.API_VERSION}`, apiV1Router);

  // ── 11. 404 Handler ──────────────────────────────────────────────────────
  // Catches requests that didn't match any route above.
  // Must be AFTER all routes, BEFORE the error handler.
  app.use(notFoundHandler);

  // ── 12. Global Error Handler ─────────────────────────────────────────────
  // Catches all errors forwarded via next(err) or thrown in catchAsync handlers.
  // Must be LAST — Express identifies it by its 4-parameter signature.
  app.use(errorHandler);

  return app;
};

// Export a singleton app instance.
// The same instance is imported by server.ts and by tests.
const app = createApp();
export default app;
