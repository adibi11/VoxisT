import { SchemaDto } from "./caseContracts";

export type DocumentBundleItemRequestDto = {
  schemaId: number;
  required: boolean;
  quantity?: number;
  label?: string | null;
  position: number;
};

export type UpsertDocumentBundleRequestDto = {
  name: string;
  description?: string | null;
  items: DocumentBundleItemRequestDto[];
};

export type DocumentBundleItemDto = {
  id: number;
  required: boolean;
  quantity: number;
  label: string | null;
  position: number;
  schema: SchemaDto;
};

export type DocumentBundleDto = {
  id: number;
  businessId: number | null;
  isCustom: boolean;
  name: string;
  description: string | null;
  items: DocumentBundleItemDto[];
  createdAt: string;
  updatedAt: string;
};
