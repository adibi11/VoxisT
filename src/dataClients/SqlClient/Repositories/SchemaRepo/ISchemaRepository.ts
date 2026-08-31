import {
  CreateBusinessDocumentTypeRequestDto,
  CreateBusinessSchemaRequestDto,
  DocumentTypeDto,
  SchemaDto
} from "../../../../contracts";

export interface ISchemaRepository {
  createBusinessDocumentType(
    businessId: number,
    request: CreateBusinessDocumentTypeRequestDto
  ): Promise<DocumentTypeDto>;

  createSystemDocumentType(request: CreateBusinessDocumentTypeRequestDto): Promise<DocumentTypeDto>;

  getBusinessDocumentTypes(businessId: number): Promise<DocumentTypeDto[]>;

  createBusinessSchema(
    businessId: number,
    request: CreateBusinessSchemaRequestDto
  ): Promise<SchemaDto | null>;

  createSystemSchema(request: CreateBusinessSchemaRequestDto): Promise<SchemaDto | null>;

  getBusinessSchemas(businessId: number): Promise<SchemaDto[]>;
  
}
