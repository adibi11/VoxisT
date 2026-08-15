-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "caseDocumentSpecificationId" INTEGER;

-- CreateTable
CREATE TABLE "CaseDocumentSpecification" (
    "id" SERIAL NOT NULL,
    "caseId" INTEGER NOT NULL,
    "schemaId" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseDocumentSpecification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaseDocumentSpecification_caseId_idx" ON "CaseDocumentSpecification"("caseId");

-- CreateIndex
CREATE INDEX "CaseDocumentSpecification_schemaId_idx" ON "CaseDocumentSpecification"("schemaId");

-- CreateIndex
CREATE INDEX "Document_caseDocumentSpecificationId_idx" ON "Document"("caseDocumentSpecificationId");

-- AddForeignKey
ALTER TABLE "CaseDocumentSpecification" ADD CONSTRAINT "CaseDocumentSpecification_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseDocumentSpecification" ADD CONSTRAINT "CaseDocumentSpecification_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "Schema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_caseDocumentSpecificationId_fkey" FOREIGN KEY ("caseDocumentSpecificationId") REFERENCES "CaseDocumentSpecification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
