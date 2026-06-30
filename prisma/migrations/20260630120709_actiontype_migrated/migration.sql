/*
  Warnings:

  - Added the required column `action` to the `BusinessAction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BusinessAction" ADD COLUMN     "action" "ActionType" NOT NULL;
