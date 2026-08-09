/**
 * @file appointment.service.ts
 * @description Business logic for booking and managing donation appointments.
 */

import { prisma } from '@config/database';
import { AppError } from '@utils/AppError';
import { Role, AppointmentStatus, RequestStatus } from '@prisma/client';
import type {
  CreateAppointmentInput,
  UpdateAppointmentStatusInput,
} from '@validators/appointment.validators';
import * as notificationService from '@services/notification.service';

const VALID_APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.CONFIRMED]: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED],
  [AppointmentStatus.COMPLETED]: [],
  [AppointmentStatus.CANCELLED]: [],
};

/**
 * Creates a new donation appointment.
 */
export const createAppointment = async (userId: string, data: CreateAppointmentInput) => {
  // 1. Verify user is a donor
  const donorProfile = await prisma.donorProfile.findUnique({
    where: { userId },
  });

  if (!donorProfile) {
    throw AppError.forbidden('Only registered donors can book appointments');
  }

  // 2. Fetch blood bank to verify it exists
  const bloodBank = await prisma.bloodBankProfile.findUnique({
    where: { id: data.bloodBankId },
  });

  if (!bloodBank) {
    throw AppError.notFound('Donation center/blood bank not found');
  }

  // A linked appointment represents the donor fulfilling the request they
  // accepted. Do not allow a donor to attach another donor's request (or a
  // request that has already been fulfilled/cancelled).
  if (data.bloodRequestId) {
    const bloodRequest = await prisma.bloodRequest.findUnique({
      where: { id: data.bloodRequestId },
      select: {
        matchedDonorId: true,
        status: true,
      },
    });

    if (!bloodRequest) {
      throw AppError.notFound('Blood request not found');
    }

    if (bloodRequest.matchedDonorId !== donorProfile.id) {
      throw AppError.forbidden('You can only book appointments for requests matched to you');
    }

    if (bloodRequest.status !== RequestStatus.MATCHED_DONOR) {
      throw AppError.conflict(
        `A linked appointment cannot be booked for a ${bloodRequest.status} request`,
      );
    }
  }

  // 3. Create appointment
  const appointment = await prisma.appointment.create({
    data: {
      donorId: donorProfile.id,
      bloodBankId: data.bloodBankId,
      bloodRequestId: data.bloodRequestId ?? null,
      appointmentDate: data.appointmentDate,
      slot: data.slot,
      status: AppointmentStatus.PENDING,
    },
    include: {
      bloodBank: true,
      donor: true,
    },
  });

  // 4. Send notifications
  // Notify donor
  await notificationService.createNotification(
    userId,
    'Appointment Booked',
    `Your donation appointment at ${bloodBank.name} has been booked for ${new Date(data.appointmentDate).toLocaleDateString()} at ${data.slot}.`,
    'APPOINTMENT_BOOKED',
  );

  // Notify blood bank
  await notificationService.createNotification(
    bloodBank.userId,
    'New Appointment Request',
    `Donor ${donorProfile.firstName} ${donorProfile.lastName} (${donorProfile.bloodType}) has booked an appointment for ${new Date(data.appointmentDate).toLocaleDateString()} at ${data.slot}.`,
    'APPOINTMENT_REQUESTED',
  );

  return appointment;
};

/**
 * Retrieves appointments based on user role.
 */
export const getAppointments = async (userId: string, role: Role) => {
  const whereClause: Record<string, unknown> = {};

  if (role === Role.DONOR) {
    const donor = await prisma.donorProfile.findUnique({ where: { userId } });
    if (!donor) {
      throw AppError.notFound('Donor profile not found');
    }
    whereClause.donorId = donor.id;
  } else if (role === Role.BLOOD_BANK) {
    const bloodBank = await prisma.bloodBankProfile.findUnique({ where: { userId } });
    if (!bloodBank) {
      throw AppError.notFound('Blood bank profile not found');
    }
    whereClause.bloodBankId = bloodBank.id;
  }

  return prisma.appointment.findMany({
    where: whereClause,
    include: {
      donor: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          bloodType: true,
          phone: true,
        },
      },
      bloodBank: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
      bloodRequest: {
        select: {
          id: true,
          patientName: true,
          hospital: {
            select: { name: true },
          },
        },
      },
    },
    orderBy: { appointmentDate: 'asc' },
  });
};

/**
 * Updates status of an existing appointment.
 */
export const updateAppointmentStatus = async (
  id: string,
  userId: string,
  role: Role,
  data: UpdateAppointmentStatusInput,
) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      donor: { include: { user: true } },
      bloodBank: { include: { user: true } },
    },
  });

  if (!appointment) {
    throw AppError.notFound('Appointment not found');
  }

  const { status: newStatus } = data;

  // Authorization check
  if (role === Role.DONOR) {
    // Donors can only cancel their own appointment
    if (appointment.donor.userId !== userId) {
      throw AppError.forbidden('You do not have permission to modify this appointment');
    }
    if (newStatus !== AppointmentStatus.CANCELLED) {
      throw AppError.forbidden('Donors can only cancel appointments');
    }
  } else if (role === Role.BLOOD_BANK) {
    // Blood banks can confirm, cancel or complete appointments at their center
    if (appointment.bloodBank.userId !== userId) {
      throw AppError.forbidden('You do not have permission to modify appointments for this center');
    }
  } else if (role !== Role.ADMIN) {
    throw AppError.forbidden('Unauthorized role');
  }

  if (!VALID_APPOINTMENT_TRANSITIONS[appointment.status].includes(newStatus)) {
    throw AppError.conflict(`Cannot change appointment from ${appointment.status} to ${newStatus}`);
  }

  // Perform status transitions in database transaction
  const updatedAppointment = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: { status: newStatus },
      include: { donor: true, bloodBank: true },
    });

    // If completed, trigger inventory credit and donor history update
    if (newStatus === AppointmentStatus.COMPLETED) {
      // 1. Update donor's last donation date
      await tx.donorProfile.update({
        where: { id: appointment.donorId },
        data: { lastDonationDate: new Date() },
      });

      // 2. Increment blood bank inventory for the donor's blood type
      await tx.bloodInventory.upsert({
        where: {
          bloodBankId_bloodType: {
            bloodBankId: appointment.bloodBankId,
            bloodType: appointment.donor.bloodType,
          },
        },
        update: {
          unitsAvailable: { increment: 1 },
        },
        create: {
          bloodBankId: appointment.bloodBankId,
          bloodType: appointment.donor.bloodType,
          unitsAvailable: 1,
        },
      });

      // 3. If linked to a blood request, fulfill it
      if (appointment.bloodRequestId) {
        const req = await tx.bloodRequest.findUnique({
          where: { id: appointment.bloodRequestId },
          include: { hospital: { include: { user: true } } },
        });

        if (
          req &&
          req.status !== RequestStatus.FULFILLED &&
          req.status !== RequestStatus.CANCELLED
        ) {
          await tx.bloodRequest.update({
            where: { id: appointment.bloodRequestId },
            data: { status: RequestStatus.FULFILLED },
          });

          // Notify hospital
          await tx.notification.create({
            data: {
              userId: req.hospital.user.id,
              title: 'Request Fulfilled',
              message: `Donor ${appointment.donor.firstName} ${appointment.donor.lastName} completed their donation for your request. It is now fulfilled.`,
              type: 'REQUEST_FULFILLED',
            },
          });
        }
      }
    }

    return updated;
  });

  // Send notifications post-transaction
  if (newStatus === AppointmentStatus.CONFIRMED) {
    await notificationService.createNotification(
      appointment.donor.user.id,
      'Appointment Confirmed',
      `Your appointment at ${appointment.bloodBank.name} has been confirmed.`,
      'APPOINTMENT_CONFIRMED',
    );
  } else if (newStatus === AppointmentStatus.CANCELLED) {
    const notifierId =
      role === Role.DONOR ? appointment.bloodBank.user.id : appointment.donor.user.id;
    const actorName = role === Role.DONOR ? 'Donor' : 'Donation center';
    await notificationService.createNotification(
      notifierId,
      'Appointment Cancelled',
      `Your appointment has been cancelled by the ${actorName.toLowerCase()}.`,
      'APPOINTMENT_CANCELLED',
    );
  } else if (newStatus === AppointmentStatus.COMPLETED) {
    await notificationService.createNotification(
      appointment.donor.user.id,
      'Donation Completed',
      `Thank you for donating blood at ${appointment.bloodBank.name}! Your donor profile is updated.`,
      'DONATION_COMPLETED',
    );
  }

  return updatedAppointment;
};
