/**
 * @file appointment.routes.ts
 * @description Routes for Appointment APIs.
 */

import { Router } from 'express';
import { authenticate, authorize, requireApprovedAccount } from '@middleware/auth.middleware';
import { validateBody } from '@middleware/validateRequest';
import * as appointmentController from '@controllers/appointment.controller';
import {
  createAppointmentSchema,
  updateAppointmentStatusSchema,
} from '@validators/appointment.validators';
import { Role } from '@prisma/client';

const router = Router();

// All appointment routes require authentication
router.use(authenticate, requireApprovedAccount);

/**
 * @route   POST /api/v1/appointments
 * @desc    Book a donation appointment
 * @access  Donor only
 */
router.post(
  '/',
  authorize(Role.DONOR),
  validateBody(createAppointmentSchema),
  appointmentController.createAppointment,
);

/**
 * @route   GET /api/v1/appointments
 * @desc    Get appointments for current authenticated user/center
 * @access  Private
 */
router.get(
  '/',
  authorize(Role.DONOR, Role.BLOOD_BANK, Role.ADMIN),
  appointmentController.getAppointments,
);

/**
 * @route   PATCH /api/v1/appointments/:id/status
 * @desc    Update status of an appointment
 * @access  Private
 */
router.patch(
  '/:id/status',
  authorize(Role.DONOR, Role.BLOOD_BANK, Role.ADMIN),
  validateBody(updateAppointmentStatusSchema),
  appointmentController.updateStatus,
);

export default router;
