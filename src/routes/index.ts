/**
 * @file routes/index.ts
 * @description Root API router — aggregates all v1 feature routes.
 *
 * WHY A ROOT ROUTER?
 * Instead of mounting every feature router directly in app.ts:
 *   app.use('/api/v1/health', healthRoutes);   // ← clutters app.ts
 *   app.use('/api/v1/auth', authRoutes);
 *   app.use('/api/v1/users', userRoutes);
 *   // ...50 more lines
 *
 * We use a single root router as an aggregator:
 *   app.use('/api/v1', apiV1Router);  // ← app.ts stays clean
 *
 * And here, we mount all feature routes under their respective paths.
 * This means app.ts never needs to change as we add new features.
 *
 * VERSIONING STRATEGY:
 * All routes are prefixed with /api/v1. When we release breaking changes,
 * we create a new routes/v2/index.ts and mount it under /api/v2.
 * Both versions can coexist — old clients keep working, new clients upgrade.
 *
 * FUTURE ROUTES (to be added in upcoming steps):
 *   router.use('/auth', authLimiter, authRoutes);
 *   router.use('/users', authenticate, userRoutes);
 *   router.use('/donors', authenticate, donorRoutes);
 *   router.use('/hospitals', authenticate, hospitalRoutes);
 *   router.use('/blood-requests', authenticate, bloodRequestRoutes);
 *   router.use('/blood-banks', authenticate, bloodBankRoutes);
 *   router.use('/admin', authenticate, authorize('ADMIN'), adminRoutes);
 */

import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import bloodRequestRoutes from './bloodRequest.routes';
import donorRoutes from './donor.routes';
import inventoryRoutes from './inventory.routes';
import adminRoutes from './admin.routes';

const router = Router();

// ─── Route Mounting ────────────────────────────────────────────────────────────

/**
 * Health check — no authentication, no rate limiting.
 * Must always be reachable, even during system degradation.
 */
router.use('/health', healthRoutes);

/**
 * Authentication routes (Register, Login, Refresh, Logout)
 * Auth-specific rate limiting is applied inside the authRoutes module.
 */
router.use('/auth', authRoutes);

/**
 * Core Features
 */
router.use('/blood-requests', bloodRequestRoutes);
router.use('/donors', donorRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/admin', adminRoutes);

// Future feature routes will be mounted here:
// router.use('/users', authenticate, userRoutes);

export default router;
