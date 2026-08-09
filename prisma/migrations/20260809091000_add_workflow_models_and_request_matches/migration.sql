-- Extend request lifecycle values used by the matching workflow.
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'MATCHED_INVENTORY';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'MATCHED_DONOR';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'IN_DELIVERY';

-- Add optional ownership links for inventory and direct-donor matches.
ALTER TABLE "blood_requests"
ADD COLUMN "matchedDonorId" UUID,
ADD COLUMN "matchedBloodBankId" UUID;

ALTER TABLE "blood_requests"
ADD CONSTRAINT "blood_requests_matchedDonorId_fkey"
FOREIGN KEY ("matchedDonorId") REFERENCES "donor_profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "blood_requests"
ADD CONSTRAINT "blood_requests_matchedBloodBankId_fkey"
FOREIGN KEY ("matchedBloodBankId") REFERENCES "blood_bank_profiles"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "donorId" UUID NOT NULL,
    "bloodBankId" UUID NOT NULL,
    "bloodRequestId" UUID,
    "appointmentDate" TIMESTAMP(3) NOT NULL,
    "slot" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_donorId_fkey"
FOREIGN KEY ("donorId") REFERENCES "donor_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_bloodBankId_fkey"
FOREIGN KEY ("bloodBankId") REFERENCES "blood_bank_profiles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_bloodRequestId_fkey"
FOREIGN KEY ("bloodRequestId") REFERENCES "blood_requests"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
