/**
 * @file health.routes.ts
 * @description Route definitions for health check endpoints.
 *
 * WHY SEPARATE ROUTES FROM CONTROLLERS?
 * Routes have exactly one responsibility: define the HTTP method and path,
 * then delegate to a controller. No business logic. No direct DB access.
 *
 * This separation means:
 * - You can change the URL without touching business logic.
 * - You can apply middleware (auth, rate limiting) per-route declaratively.
 * - Routes serve as living documentation of the API surface.
 *
 * MIDDLEWARE PLACEMENT NOTE:
 * Middleware on a specific route only applies to that route.
 *   router.get('/health', authMiddleware, getHealth)  ← auth required
 *   router.get('/health', getHealth)                  ← no auth required
 *
 * Health endpoints are intentionally public — monitoring tools and load
 * balancers should never need authentication credentials.
 */

import { Router } from 'express';
import { getHealth } from '@controllers/health.controller';

const router = Router();

/**
 * @route   GET /api/v1/health
 * @desc    Deep health check — checks process uptime + database connectivity
 * @access  Public (no authentication required)
 */
router.get('/', getHealth);

export default router;
