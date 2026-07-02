/**
 * @file donor.routes.ts
 * @description Routes for Donor APIs.
 */

import { Router } from 'express';
import { authenticate, authorize } from '@middleware/auth.middleware';
import { validateQuery } from '@middleware/validateRequest';
import * as donorController from '@controllers/donor.controller';
import { Role } from '@prisma/client';
import { searchDonorsQuerySchema } from '@validators/donor.validators';

const router = Router();

// All donor routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/donors/search
 * @desc    Search for compatible donors based on blood type and location
 * @access  Hospitals, Blood Banks, and Admins only (Privacy Protection)
 */
router.get(
  '/search',
  authorize(Role.HOSPITAL, Role.BLOOD_BANK, Role.ADMIN),
  validateQuery(searchDonorsQuerySchema),
  donorController.searchDonors
);

export default router;
