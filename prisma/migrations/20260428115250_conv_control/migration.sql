/*
  Warnings:

  - Added the required column `enderMessage` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `escalationMessage` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `language` to the `Business` table without a default value. This is not possible if the table is not empty.
  - Added the required column `straterMessage` to the `Business` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "enderMessage" TEXT NOT NULL,
ADD COLUMN     "escalationMessage" TEXT NOT NULL,
ADD COLUMN     "language" TEXT NOT NULL,
ADD COLUMN     "straterMessage" TEXT NOT NULL;
