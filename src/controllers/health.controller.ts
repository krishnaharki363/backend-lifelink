/**
 * @file health.controller.ts
 * @description Controller for the system health check endpoint.
 *
 * WHY A HEALTH CHECK ENDPOINT?
 * Every production service needs a health check for:
 *
 * 1. LOAD BALANCERS — AWS ELB, Nginx, and Render's health checks ping this
 *    endpoint to decide whether to route traffic to this instance.
 *    If it returns non-2xx, traffic is redirected to a healthy instance.
 *
 * 2. CONTAINER ORCHESTRATORS — Kubernetes uses liveness/readiness probes
 *    on this endpoint to decide when to restart or replace a pod.
 *
 * 3. MONITORING — Uptime monitoring tools (UptimeRobot, Betterstack) poll
 *    this to alert the on-call engineer when the service goes down.
 *
 * 4. DEPLOYMENT VERIFICATION — After deploying a new version, CI/CD pipelines
 *    poll this endpoint to confirm the deployment succeeded before cutting traffic.
 *
 * TWO TYPES OF HEALTH CHECKS:
 * - SHALLOW (liveness): Is the process alive? Can it respond to HTTP?
 *   → Returns immediately. Used by: Kubernetes liveness probe.
 *
 * - DEEP (readiness): Is every dependency healthy (DB, cache, queues)?
 *   → Checks downstream services. Used by: Kubernetes readiness probe,
 *     load balancers, deployment verification.
 *
 * We implement the deep check — more useful and more honest.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess, sendError } from '@utils/apiResponse';
import { checkDatabaseConnection } from '@config/database';
import { env } from '@config/env';
import { createContextLogger } from '@config/logger';
import { HttpStatus } from '@constants/http.constants';
import { ErrorCode } from '@interfaces/error.interface';

const log = createContextLogger('HealthController');

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceStatus {
  status: 'healthy' | 'unhealthy';
  responseTimeMs?: number;
  error?: string;
}

interface HealthCheckData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number; // seconds
  uptimeFormatted: string;
  environment: string;
  version: string;
  services: {
    database: ServiceStatus;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats uptime seconds into a human-readable string.
 * e.g. 90061 seconds → "1d 1h 1m 1s"
 */
const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
};

/**
 * Checks database connectivity and measures response time.
 * Returns a ServiceStatus object — never throws.
 * The health check itself must remain robust even if dependencies are broken.
 */
const checkDatabase = async (): Promise<ServiceStatus> => {
  const start = Date.now();
  try {
    await checkDatabaseConnection();
    return {
      status: 'healthy',
      responseTimeMs: Date.now() - start,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown database error';
    log.warn({ err }, 'Database health check failed');
    return {
      status: 'unhealthy',
      responseTimeMs: Date.now() - start,
      error,
    };
  }
};

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/health
 *
 * Performs a deep health check of the LifeLink backend:
 * - Checks that the Express process is alive
 * - Verifies database connectivity via a `SELECT 1` query
 * - Reports process uptime
 *
 * Response status:
 * - 200 OK       → All services healthy
 * - 503 Service Unavailable → One or more services are unhealthy
 *
 * Note: We use catchAsync so any unexpected crash in this handler
 * still gets routed to our global error handler.
 */
export const getHealth = catchAsync(async (_req: Request, res: Response): Promise<void> => {
  const uptimeSeconds = process.uptime();

  // Run all service checks concurrently — faster than sequential
  const [databaseStatus] = await Promise.all([checkDatabase()]);

  // Determine overall system status
  const allHealthy = databaseStatus.status === 'healthy';
  const overallStatus: HealthCheckData['status'] = allHealthy ? 'healthy' : 'unhealthy';

  const data: HealthCheckData = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(uptimeSeconds),
    uptimeFormatted: formatUptime(uptimeSeconds),
    environment: env.NODE_ENV,
    version: process.env['npm_package_version'] ?? '1.0.0',
    services: {
      database: databaseStatus,
    },
  };

  if (allHealthy) {
    sendSuccess(res, data, 'LifeLink Backend is running', HttpStatus.OK);
  } else {
    // Use sendError for unhealthy status — signals to load balancers to stop routing
    sendError(
      res,
      'One or more services are unhealthy',
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SERVICE_UNAVAILABLE,
      data,
    );
  }
});
