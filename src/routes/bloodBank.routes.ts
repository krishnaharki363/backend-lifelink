/**
 * @file bloodBank.routes.ts
 * @description Routes for Blood Bank APIs.
 */

import { Router } from 'express';
import { authenticate } from '@middleware/auth.middleware';
import * as bloodBankController from '@controllers/bloodBank.controller';

const router = Router();

// All blood bank endpoints require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/blood-banks
 * @desc    Get all registered blood banks/donation centers
 * @access  Private
 */
router.get('/', bloodBankController.listBloodBanks);

export default router;
