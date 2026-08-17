import { DocumentBundleDto, UpsertDocumentBundleRequestDto } from "../../../../contracts";

export type DocumentBundleMutationResult =
  | { outcome: "success"; bundle: DocumentBundleDto }
  | { outcome: "bundle_not_found" }
  | { outcome: "schemas_not_found"; schemaIds: number[] };

export interface IDocumentBundleRepository {
  listBundles(businessId: number): Promise<DocumentBundleDto[]>;
  getBundle(businessId: number, bundleId: number): Promise<DocumentBundleDto | null>;
  createBundle(
    businessId: number,
    request: UpsertDocumentBundleRequestDto
  ): Promise<DocumentBundleMutationResult>;
  updateBundle(
    businessId: number,
    bundleId: number,
    request: UpsertDocumentBundleRequestDto
  ): Promise<DocumentBundleMutationResult>;
  deleteBundle(businessId: number, bundleId: number): Promise<boolean>;
}