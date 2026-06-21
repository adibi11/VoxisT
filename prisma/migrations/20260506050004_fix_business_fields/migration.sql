/*
  Warnings:

  - You are about to drop the column `straterMessage` on the `Business` table. All the data in the column will be lost.
  - Added the required column `starterMessage` to the `Business` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Business" DROP COLUMN "straterMessage",
ADD COLUMN     "starterMessage" TEXT NOT NULL;
