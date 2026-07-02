/**
 * @file server.ts
 * @description HTTP server entry point with graceful shutdown handling.
 *
 * THIS FILE DOES THREE THINGS:
 * 1. Starts the HTTP server and begins accepting requests.
 * 2. Handles operating system signals for graceful shutdown.
 * 3. Handles uncaught exceptions and unhandled rejections as a last resort.
 *
 * WHY GRACEFUL SHUTDOWN?
 * When Render/Docker/Kubernetes wants to stop your container, it sends SIGTERM.
 * Without handling it:
 *   - The process dies immediately
 *   - In-flight requests are abruptly terminated (clients get connection reset)
 *   - Database transactions mid-flight are rolled back (potential data corruption)
 *
 * With graceful shutdown:
 *   1. Stop accepting new connections (server.close())
 *   2. Wait for in-flight requests to complete
 *   3. Close the database connection pool cleanly
 *   4. Exit with code 0 (success — tells the orchestrator it was intentional)
 *
 * PROCESS SIGNAL REFERENCE:
 *   SIGTERM → Sent by Docker, Kubernetes, Render during planned shutdown.
 *             "Please stop gracefully." — The polite signal.
 *   SIGINT  → Sent when you press Ctrl+C in the terminal during development.
 *             We handle it the same way for a clean dev experience.
 *
 * UNCAUGHT EXCEPTION HANDLING:
 * Even with catchAsync, some errors escape — errors in event listeners,
 * synchronous errors in middleware registration, etc.
 * We register handlers for these as a final safety net.
 * The correct response is to log and EXIT — never try to resume.
 * A crashed Node.js process in an unknown state is dangerous to keep running.
 * Docker/Kubernetes will restart the container automatically.
 */

import http from 'http';
import app from './app';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { disconnectDatabase } from '@config/database';

// ─── Server Creation ──────────────────────────────────────────────────────────

const server = http.createServer(app);

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

/**
 * Graceful shutdown routine.
 * Called on SIGTERM and SIGINT.
 *
 * @param signal - The signal that triggered the shutdown (for logging)
 */
const gracefulShutdown = (signal: string): void => {
  logger.info(`${signal} received — initiating graceful shutdown`);

  // Stop accepting new HTTP connections.
  // Existing connections will be allowed to finish.
  server.close(async () => {
    logger.info('HTTP server closed — no longer accepting new connections');

    try {
      // Close the Prisma connection pool.
      // This waits for any pending queries to complete before closing.
      await disconnectDatabase();
      logger.info('All connections closed. Exiting cleanly.');
      process.exit(0); // 0 = intentional, clean exit
    } catch (err) {
      logger.error({ err }, 'Error during graceful shutdown');
      process.exit(1); // 1 = error exit
    }
  });

  // Safety timeout — if graceful shutdown takes too long (e.g., a query hangs),
  // force-exit after 10 seconds. This prevents the process from being stuck
  // indefinitely in a broken state.
  setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s — forcing exit');
    process.exit(1);
  }, 10_000).unref(); // .unref() prevents this timer from keeping the process alive
};

// ─── Process Signal Handlers ──────────────────────────────────────────────────

// Planned shutdown (Docker stop, Kubernetes pod termination, Render deploy)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Ctrl+C in terminal (development)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ─── Safety Net Error Handlers ────────────────────────────────────────────────

/**
 * Handles synchronous exceptions that escaped all try/catch blocks.
 *
 * IMPORTANT: After an uncaught exception, the process is in an UNKNOWN STATE.
 * The correct action is always to:
 *   1. Log the error (so we know what happened)
 *   2. Exit the process (Docker/Kubernetes will restart it)
 *
 * DO NOT try to keep the server running after an uncaught exception.
 * This is an anti-pattern that can lead to silent data corruption.
 */
process.on('uncaughtException', (err: Error) => {
  logger.fatal({ err }, 'UNCAUGHT EXCEPTION — shutting down immediately');
  // Give the logger a tick to flush before exiting
  setTimeout(() => process.exit(1), 100).unref();
});

/**
 * Handles unhandled Promise rejections (async errors without .catch()).
 *
 * In Node.js 15+, unhandled rejections crash the process by default.
 * We handle it explicitly for consistent logging and clean shutdown.
 */
process.on('unhandledRejection', (reason: unknown) => {
  logger.fatal({ reason }, 'UNHANDLED PROMISE REJECTION — shutting down immediately');
  // Trigger graceful shutdown to close connections before exiting
  server.close(() => {
    process.exit(1);
  });
});

// ─── Server Startup ───────────────────────────────────────────────────────────

/**
 * Start the HTTP server and bind to the configured port.
 * We use server.listen() (not app.listen()) because we created the
 * server manually — this gives us full control over the http.Server instance,
 * which we need for the graceful shutdown (server.close()).
 */
server.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      environment: env.NODE_ENV,
      apiVersion: env.API_VERSION,
      pid: process.pid,
    },
    `🚀 LifeLink Backend started successfully`,
  );

  logger.info(`📡 API available at: http://localhost:${env.PORT}/api/${env.API_VERSION}`);
  logger.info(`❤️  Health check at: http://localhost:${env.PORT}/api/${env.API_VERSION}/health`);
});

// ─── Export for Testing ───────────────────────────────────────────────────────

/**
 * Export the server instance so tests can call server.close()
 * to clean up after each test suite.
 */
export default server;
