import { Prisma, PrismaClient } from "../../../../generated/prisma/client";
import {
  CreateBusinessDocumentTypeRequestDto,
  CreateBusinessSchemaRequestDto,
  DocumentTypeDto,
  SchemaDto
} from "../../../../contracts";
import { ISchemaRepository } from "./ISchemaRepository";

export class SchemaRepository implements ISchemaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createBusinessDocumentType(
    businessId: number,
    request: CreateBusinessDocumentTypeRequestDto
  ): Promise<DocumentTypeDto> {
    const created = await this.prisma.documentType.create({
      data: {
        business: { connect: { id: businessId } },
        name: request.name,
        category: request.category ?? null,
        isCustom: true
      }
    });
    return mapDocumentType(
      { businessId, createdAt: created.createdAt, id: created.id, isCustom: true, name: created.name, category: created.category, updatedAt: created.updatedAt }
    );
  }

  async createSystemDocumentType(request: CreateBusinessDocumentTypeRequestDto): Promise<DocumentTypeDto> {
    return mapDocumentType(await this.prisma.documentType.create({
      data: { businessId: null, name: request.name, category: request.category ?? null, isCustom: false }
    }));
  }

  async getBusinessSchemas(businessId: number): Promise<SchemaDto[]> {
    const schemas = await this.prisma.schema.findMany({
      where: { OR: [{ businessId, isCustom: true }, { businessId: null, isCustom: false }] },
      include: { documentType: true }
    });
    return schemas.map(s => mapSchema({
      id: s.id,
      businessId: s.businessId,
      name: s.name,
      version: s.version,
      requirementSchema: s.requirementSchema,
      isCustom: s.isCustom,
      documentType: s.documentType
    }));
  }

  async getBusinessDocumentTypes(businessId: number): Promise<DocumentTypeDto[]> {
    const documentTypes = await this.prisma.documentType.findMany({
      where: { OR: [{ businessId, isCustom: true }, { businessId: null, isCustom: false }] },
      orderBy: [{ name: "asc" }, { id: "asc" }]
    });
    return documentTypes.map(t => mapDocumentType(t));
  }

  async createBusinessSchema(
    businessId: number,
    request: CreateBusinessSchemaRequestDto
  ): Promise<SchemaDto | null> {
    const documentType = await this.prisma.documentType.findFirst({
      where: {
        id: request.documentTypeId,
        OR: [
          { businessId: businessId, isCustom: true },
          { businessId: null, isCustom: false }
        ]
      }
    });
    if (!documentType) {
      return null;
    }

    const schema = await this.prisma.schema.create({
      data: {
        business: { connect: { id: businessId } },
        documentType: { connect: { id: documentType.id } },
        name: request.name,
        version: request.version,
        requirementSchema: request.requirementSchema as Prisma.InputJsonObject,
        isCustom: true
      },
      include: { documentType: true }
    });

    return mapSchema({
      id: schema.id,
      businessId: schema.businessId,
      name: schema.name,
      version: schema.version,
      requirementSchema: schema.requirementSchema,
      isCustom: true,
      documentType: schema.documentType
    });
  }

  async createSystemSchema(request: CreateBusinessSchemaRequestDto): Promise<SchemaDto | null> {
    const documentType = await this.prisma.documentType.findFirst({
      where: { id: request.documentTypeId, businessId: null, isCustom: false }
    });
    if (!documentType) return null;

    const schema = await this.prisma.schema.create({
      data: {
        documentType: { connect: { id: documentType.id } },
        name: request.name,
        version: request.version,
        requirementSchema: request.requirementSchema as Prisma.InputJsonObject,
        isCustom: false
      },
      include: { documentType: true }
    });
    return mapSchema(schema);
  }
}

function mapDocumentType(documentType: {
  id: number;
  businessId: number | null;
  name: string;
  category: string | null;
  isCustom: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DocumentTypeDto {
  return {
    id: documentType.id,
    businessId: documentType.businessId,
    name: documentType.name,
    category: documentType.category,
    isCustom: documentType.isCustom,
    createdAt: documentType.createdAt.toISOString(),
    updatedAt: documentType.updatedAt.toISOString()
  };

}
function mapSchema(schema: {
  id: number;
  businessId: number | null;
  name: string;
  version: number;
  requirementSchema: Prisma.JsonValue;
  isCustom: boolean;
  documentType: {
    id: number;
    name: string;
    category: string | null;
  };
}): SchemaDto {
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
