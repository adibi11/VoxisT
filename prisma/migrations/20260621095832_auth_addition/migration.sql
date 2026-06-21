-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('admin', 'user');

-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "platformRole" "PlatformRole" NOT NULL DEFAULT 'user';
