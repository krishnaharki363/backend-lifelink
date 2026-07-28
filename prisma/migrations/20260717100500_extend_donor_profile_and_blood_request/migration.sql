-- AlterTable
ALTER TABLE "blood_requests" ADD COLUMN     "ward" TEXT;

-- AlterTable
ALTER TABLE "donor_profiles" ADD COLUMN     "address" TEXT,
ADD COLUMN     "availableToDonate" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "currentlyHealthy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "donatedBefore" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "emergencyContactRelationship" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "medicalConditions" TEXT,
ADD COLUMN     "municipality" TEXT,
ADD COLUMN     "onMedication" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "preferredContactMethod" TEXT NOT NULL DEFAULT 'phone',
ADD COLUMN     "province" TEXT,
ADD COLUMN     "weight" DOUBLE PRECISION,
ALTER COLUMN "city" SET DEFAULT '',
ALTER COLUMN "state" SET DEFAULT '';
