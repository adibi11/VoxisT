-- CreateTable
CREATE TABLE "CasePortalAccess" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3),

    CONSTRAINT "CasePortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CasePortalAccess_tokenHash_key" ON "CasePortalAccess"("tokenHash");
CREATE INDEX "CasePortalAccess_caseId_revokedAt_idx" ON "CasePortalAccess"("caseId", "revokedAt");
CREATE INDEX "CasePortalAccess_expiresAt_idx" ON "CasePortalAccess"("expiresAt");

ALTER TABLE "CasePortalAccess" ADD CONSTRAINT "CasePortalAccess_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
