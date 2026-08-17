-- CreateTable
CREATE TABLE "DocumentBundle" (
    "id" SERIAL NOT NULL,
    "businessId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentBundleItem" (
    "id" SERIAL NOT NULL,
    "bundleId" INTEGER NOT NULL,
    "schemaId" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "DocumentBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentBundle_businessId_name_id_idx" ON "DocumentBundle"("businessId", "name", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentBundleItem_bundleId_schemaId_key" ON "DocumentBundleItem"("bundleId", "schemaId");

-- CreateIndex
CREATE INDEX "DocumentBundleItem_bundleId_position_id_idx" ON "DocumentBundleItem"("bundleId", "position", "id");

-- CreateIndex
CREATE INDEX "DocumentBundleItem_schemaId_idx" ON "DocumentBundleItem"("schemaId");

-- AddForeignKey
ALTER TABLE "DocumentBundle" ADD CONSTRAINT "DocumentBundle_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBundleItem" ADD CONSTRAINT "DocumentBundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "DocumentBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentBundleItem" ADD CONSTRAINT "DocumentBundleItem_schemaId_fkey" FOREIGN KEY ("schemaId") REFERENCES "Schema"("id") ON DELETE RESTRICT ON UPDATE CASCADE;