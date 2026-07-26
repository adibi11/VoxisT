-- CreateEnum
CREATE TYPE "BusinessParameterType" AS ENUM ('CATEGORICAL', 'CONTINUOUS', 'TIME', 'TEXT');

-- AlterTable
ALTER TABLE "BusinessParameter" ADD COLUMN     "config" JSONB,
ADD COLUMN     "paramType" "BusinessParameterType" NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "ParameterAnswer" ADD COLUMN     "valueCategory" TEXT,
ADD COLUMN     "valueNumber" DOUBLE PRECISION,
ADD COLUMN     "valueTime" TIMESTAMP(3);
