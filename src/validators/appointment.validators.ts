/**
 * @file appointment.validators.ts
 * @description Zod validation schemas for Appointment API payloads.
 */

import { z } from 'zod';
import { AppointmentStatus } from '@prisma/client';

export const createAppointmentSchema = z.object({
  bloodBankId: z.string().uuid('Invalid blood bank ID'),
  bloodRequestId: z.string().uuid('Invalid blood request ID').optional(),
  
  appointmentDate: z.string().pipe(
    z.coerce.date().refine((date) => date >= new Date(new Date().setHours(0,0,0,0)), {
      message: 'Appointment date must be today or in the future',
    })
  ),
  
  slot: z.string().min(2, 'Slot is required'),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentStatusSchema = z.object({
  status: z.nativeEnum(AppointmentStatus, { errorMap: () => ({ message: 'Invalid status' }) }),
});

export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;
