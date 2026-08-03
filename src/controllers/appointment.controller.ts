/**
 * @file appointment.controller.ts
 * @description Controller for Appointment API endpoints.
 */

import type { Request, Response } from 'express';
import { catchAsync } from '@utils/asyncWrapper';
import { sendSuccess } from '@utils/apiResponse';
import * as appointmentService from '@services/appointment.service';
import { HttpStatus } from '@constants/http.constants';
import { AppError } from '@utils/AppError';
import type {
  CreateAppointmentInput,
  UpdateAppointmentStatusInput,
} from '@validators/appointment.validators';

/**
 * POST /api/v1/appointments
 * Books a new donation appointment.
 */
export const createAppointment = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const result = await appointmentService.createAppointment(
    user.userId,
    req.body as CreateAppointmentInput
  );
  sendSuccess(res, result, 'Appointment booked successfully', HttpStatus.CREATED);
});

/**
 * GET /api/v1/appointments
 * Retrieves role-based appointments.
 */
export const getAppointments = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const result = await appointmentService.getAppointments(user.userId, user.role);
  sendSuccess(res, result, 'Appointments retrieved successfully', HttpStatus.OK);
});

/**
 * PATCH /api/v1/appointments/:id/status
 * Updates appointment status.
 */
export const updateStatus = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized('Authentication context missing');
  }

  const appointmentId = req.params.id;
  if (!appointmentId) {
    throw AppError.badRequest('Appointment ID is required');
  }

  const result = await appointmentService.updateAppointmentStatus(
    appointmentId,
    user.userId,
    user.role,
    req.body as UpdateAppointmentStatusInput
  );
  sendSuccess(res, result, 'Appointment status updated successfully', HttpStatus.OK);
});
