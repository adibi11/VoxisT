import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
  DocumentBundleDto,
  SchemaDto,
  UpsertDocumentBundleRequestDto
} from "../../../../contracts";
import {
  DocumentBundleMutationResult,
  IDocumentBundleRepository
} from "./IDocumentBundleRepository";

const bundleInclude = {
  items: {
    include: { schema: { include: { documentType: true } } },
    orderBy: [{ position: "asc" }, { id: "asc" }]
  }
} satisfies Prisma.DocumentBundleInclude;

type BundleRow = Prisma.DocumentBundleGetPayload<{ include: typeof bundleInclude }>;
type DbClient = PrismaClient | Prisma.TransactionClient;

export class DocumentBundleRepository implements IDocumentBundleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBundles(businessId: number): Promise<DocumentBundleDto[]> {
    const bundles = await this.prisma.documentBundle.findMany({
      where: { businessId },
      include: bundleInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }]
    });
    return bundles.map(mapBundle);
  }

  async getBundle(businessId: number, bundleId: number): Promise<DocumentBundleDto | null> {
    const bundle = await this.prisma.documentBundle.findFirst({
      where: { id: bundleId, businessId },
      include: bundleInclude
    });
    return bundle ? mapBundle(bundle) : null;
  }

  async createBundle(
    businessId: number,
    request: UpsertDocumentBundleRequestDto
  ): Promise<DocumentBundleMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const missingSchemaIds = await findMissingSchemaIds(tx, businessId, request);
      if (missingSchemaIds.length > 0) {
        return { outcome: "schemas_not_found", schemaIds: missingSchemaIds };
      }

      const bundle = await tx.documentBundle.create({
        data: {
          businessId,
          name: request.name.trim(),
          description: normalizedNullableText(request.description),
          items: { create: itemCreateData(request) }
        },
        include: bundleInclude
      });
      return { outcome: "success", bundle: mapBundle(bundle) };
    });
  }

  async updateBundle(
    businessId: number,
    bundleId: number,
    request: UpsertDocumentBundleRequestDto
  ): Promise<DocumentBundleMutationResult> {
    return this.prisma.$transaction(async (tx) => {
      const bundle = await tx.documentBundle.findFirst({
        where: { id: bundleId, businessId },
        select: { id: true }
      });
      if (!bundle) return { outcome: "bundle_not_found" };

      const missingSchemaIds = await findMissingSchemaIds(tx, businessId, request);
      if (missingSchemaIds.length > 0) {
        return { outcome: "schemas_not_found", schemaIds: missingSchemaIds };
      }

      await tx.documentBundleItem.deleteMany({ where: { bundleId } });
      const updated = await tx.documentBundle.update({
        where: { id: bundleId },
        data: {
          name: request.name.trim(),
          description: normalizedNullableText(request.description),
          items: { create: itemCreateData(request) }
        },
        include: bundleInclude
      });
      return { outcome: "success", bundle: mapBundle(updated) };
    });
  }

  async deleteBundle(businessId: number, bundleId: number): Promise<boolean> {
    const deleted = await this.prisma.documentBundle.deleteMany({
      where: { id: bundleId, businessId }
    });
    return deleted.count === 1;
  }
}

async function findMissingSchemaIds(
  db: DbClient,
  businessId: number,
  request: UpsertDocumentBundleRequestDto
): Promise<number[]> {
  const requestedIds = [...new Set(request.items.map((item) => item.schemaId))];
  if (requestedIds.length === 0) return [];
  const schemas = await db.schema.findMany({
    where: { id: { in: requestedIds }, businessId, isCustom: true },
    select: { id: true }
  });
  const foundIds = new Set(schemas.map((schema) => schema.id));
  return requestedIds.filter((schemaId) => !foundIds.has(schemaId));
}

function itemCreateData(request: UpsertDocumentBundleRequestDto) {
  return request.items.map((item) => ({
    schemaId: item.schemaId,
    required: item.required,
    quantity: item.quantity ?? 1,
    label: normalizedNullableText(item.label),
    position: item.position
  }));
}

function mapBundle(bundle: BundleRow): DocumentBundleDto {
  return {
    id: bundle.id,
    name: bundle.name,
    description: bundle.description,
    items: bundle.items.map((item) => ({
      id: item.id,
      required: item.required,
      quantity: item.quantity,
      label: item.label,
      position: item.position,
      schema: mapSchema(item.schema)
    })),
    createdAt: bundle.createdAt.toISOString(),
    updatedAt: bundle.updatedAt.toISOString()
  };
}

function mapSchema(schema: BundleRow["items"][number]["schema"]): SchemaDto {
  return {
    id: schema.id,
    businessId: schema.businessId,
    isCustom: schema.isCustom,
    documentType: {
      id: schema.documentType.id,
      name: schema.documentType.name,
      category: schema.documentType.category
    },
    name: schema.name,
    version: schema.version,
    requirementSchema: schema.requirementSchema
  };
}

function normalizedNullableText(value?: string | null): string | null {
  return value?.trim() || null;
}