/**
 * @file inventory.routes.ts
 * @description Routes for Blood Inventory APIs.
 */

import { Router } from 'express';
import { authenticate, authorize } from '@middleware/auth.middleware';
import { validateBody } from '@middleware/validateRequest';
import * as inventoryController from '@controllers/inventory.controller';
import { Role } from '@prisma/client';
import { updateInventorySchema } from '@validators/inventory.validators';

const router = Router();

// All inventory routes require authentication
router.use(authenticate);

/**
 * @route   PUT /api/v1/inventory
 * @desc    Update or create blood stock for a specific blood type
 * @access  Blood Banks only
 */
router.put(
  '/',
  authorize(Role.BLOOD_BANK),
  validateBody(updateInventorySchema),
  inventoryController.updateInventory
);

/**
 * @route   GET /api/v1/inventory
 * @desc    View the entire system's blood inventory grouped by Blood Bank
 * @access  Hospitals, Blood Banks, and Admins
 */
router.get(
  '/',
  authorize(Role.HOSPITAL, Role.BLOOD_BANK, Role.ADMIN),
  inventoryController.getSystemInventory
);

export default router;
