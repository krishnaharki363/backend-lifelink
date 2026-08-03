/**
 * @file appointment.routes.ts
 * @description Routes for Appointment APIs.
 */

import { Router } from 'express';
import { authenticate } from '@middleware/auth.middleware';
import { validateBody } from '@middleware/validateRequest';
import * as appointmentController from '@controllers/appointment.controller';
import { createAppointmentSchema, updateAppointmentStatusSchema } from '@validators/appointment.validators';

const router = Router();

// All appointment routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/appointments
 * @desc    Book a donation appointment
 * @access  Donor only
 */
router.post(
  '/',
  validateBody(createAppointmentSchema),
  appointmentController.createAppointment
);

/**
 * @route   GET /api/v1/appointments
 * @desc    Get appointments for current authenticated user/center
 * @access  Private
 */
router.get('/', appointmentController.getAppointments);

/**
 * @route   PATCH /api/v1/appointments/:id/status
 * @desc    Update status of an appointment
 * @access  Private
 */
router.patch(
  '/:id/status',
  validateBody(updateAppointmentStatusSchema),
  appointmentController.updateStatus
);

export default router;
