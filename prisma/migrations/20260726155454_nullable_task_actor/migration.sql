-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_updatedByUserId_fkey";

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "createdByUserId" DROP NOT NULL,
ALTER COLUMN "updatedByUserId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
