import { Router } from 'express';
import { authenticate, authorize, requireApprovedAccount } from '@middleware/auth.middleware';
import { validateBody, validateQuery } from '@middleware/validateRequest';
import * as donorController from '@controllers/donor.controller';
import { Role } from '@prisma/client';
import { searchDonorsQuerySchema, updateDonorProfileSchema } from '@validators/donor.validators';

const router = Router();

// All donor routes require authentication
router.use(authenticate, requireApprovedAccount);

/**
 * @route   GET /api/v1/donors/profile
 * @desc    Get the current donor's profile
 * @access  Donor only
 */
router.get('/profile', authorize(Role.DONOR), donorController.getProfile);

/**
 * @route   PUT /api/v1/donors/profile
 * @desc    Update the current donor's profile
 * @access  Donor only
 */
router.put(
  '/profile',
  authorize(Role.DONOR),
  validateBody(updateDonorProfileSchema),
  donorController.updateProfile,
);

/**
 * @route   GET /api/v1/donors/search
 * @desc    Search for compatible donors based on blood type and location
 * @access  Hospitals, Blood Banks, and Admins only (Privacy Protection)
 */
router.get(
  '/search',
  authorize(Role.HOSPITAL, Role.BLOOD_BANK, Role.ADMIN),
  validateQuery(searchDonorsQuerySchema),
  donorController.searchDonors,
);

export default router;
