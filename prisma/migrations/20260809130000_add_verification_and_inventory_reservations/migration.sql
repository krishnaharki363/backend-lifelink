-- Organization accounts require admin approval before operational use.
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "users"
ADD COLUMN "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'APPROVED';

-- Physical stock remains in unitsAvailable; matched requests hold unitsReserved.
ALTER TABLE "blood_inventories"
ADD COLUMN "unitsReserved" INTEGER NOT NULL DEFAULT 0;
