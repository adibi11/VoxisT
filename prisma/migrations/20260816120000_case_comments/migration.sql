-- CreateTable
CREATE TABLE "CaseComment" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "authorUserId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseComment_caseId_createdAt_id_idx" ON "CaseComment"("caseId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CaseComment_authorUserId_idx" ON "CaseComment"("authorUserId");

-- AddForeignKey
ALTER TABLE "CaseComment" ADD CONSTRAINT "CaseComment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseComment" ADD CONSTRAINT "CaseComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "AppUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
