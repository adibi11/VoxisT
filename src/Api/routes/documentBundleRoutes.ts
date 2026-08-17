import express from "express";
import { UpsertDocumentBundleRequestDto } from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { DocumentBundleMutationResult } from "../../dataClients/SqlClient/Repositories/DocumentBundleRepo/IDocumentBundleRepository";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess } from "../authMiddleware";

export const DOCUMENT_BUNDLE_NAME_MAX_LENGTH = 120;
export const DOCUMENT_BUNDLE_DESCRIPTION_MAX_LENGTH = 1000;
export const DOCUMENT_BUNDLE_LABEL_MAX_LENGTH = 200;
export const DOCUMENT_BUNDLE_QUANTITY_MAX = 120;

export function getDocumentBundleRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger) {
  app.get("/cases/bundles", requireAuth, listDocumentBundlesHandler(sql, logger));
  app.get("/cases/bundles/:bundleId", requireAuth, getDocumentBundleHandler(sql, logger));
  app.post("/cases/bundles", requireAuth, createDocumentBundleHandler(sql, logger));
  app.put("/cases/bundles/:bundleId", requireAuth, updateDocumentBundleHandler(sql, logger));
  app.delete("/cases/bundles/:bundleId", requireAuth, deleteDocumentBundleHandler(sql, logger));
}

export function listDocumentBundlesHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const businessId = authenticatedBusinessId(req as AuthenticatedRequest, res);
    if (!businessId) return;
    try {
      res.status(200).json(await sql.documentBundleRepository.listBundles(businessId));
    } catch (error) {
      logger.error("document_bundle.list.failed", { error, businessId });
      res.status(500).json({ message: "Failed to list Document Bundles" });
    }
  };
}

export function getDocumentBundleHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const businessId = authenticatedBusinessId(req as AuthenticatedRequest, res);
    const bundleId = positiveIdParam(req.params.bundleId);
    if (!businessId) return;
    if (!bundleId) return invalidBundleId(res);
    try {
      const bundle = await sql.documentBundleRepository.getBundle(businessId, bundleId);
      bundle
        ? res.status(200).json(bundle)
        : res.status(404).json({ code: "NOT_FOUND", message: "Document Bundle not found" });
    } catch (error) {
      logger.error("document_bundle.get.failed", { error, businessId, bundleId });
      res.status(500).json({ message: "Failed to fetch Document Bundle" });
    }
  };
}

export function createDocumentBundleHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const businessId = authenticatedBusinessId(req as AuthenticatedRequest, res);
    if (!businessId) return;
    const request = req.body as Partial<UpsertDocumentBundleRequestDto> | undefined;
    if (!isValidUpsertDocumentBundleRequest(request)) return invalidBundleRequest(res);
    try {
      const result = await sql.documentBundleRepository.createBundle(businessId, normalizeRequest(request));
      if (result.outcome === "success") {
        res.status(201).json(result.bundle);
        return;
      }
      sendMutationFailure(res, result);
    } catch (error) {
      logger.error("document_bundle.create.failed", { error, businessId });
      res.status(500).json({ message: "Failed to create Document Bundle" });
    }
  };
}

export function updateDocumentBundleHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const businessId = authenticatedBusinessId(req as AuthenticatedRequest, res);
    const bundleId = positiveIdParam(req.params.bundleId);
    if (!businessId) return;
    if (!bundleId) return invalidBundleId(res);
    const request = req.body as Partial<UpsertDocumentBundleRequestDto> | undefined;
    if (!isValidUpsertDocumentBundleRequest(request)) return invalidBundleRequest(res);
    try {
      const result = await sql.documentBundleRepository.updateBundle(
        businessId,
        bundleId,
        normalizeRequest(request)
      );
      if (result.outcome === "success") {
        res.status(200).json(result.bundle);
        return;
      }
      sendMutationFailure(res, result);
    } catch (error) {
      logger.error("document_bundle.update.failed", { error, businessId, bundleId });
      res.status(500).json({ message: "Failed to update Document Bundle" });
    }
  };
}

export function deleteDocumentBundleHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const businessId = authenticatedBusinessId(req as AuthenticatedRequest, res);
    const bundleId = positiveIdParam(req.params.bundleId);
    if (!businessId) return;
    if (!bundleId) return invalidBundleId(res);
    try {
      const deleted = await sql.documentBundleRepository.deleteBundle(businessId, bundleId);
      deleted
        ? res.status(204).send()
        : res.status(404).json({ code: "NOT_FOUND", message: "Document Bundle not found" });
    } catch (error) {
      logger.error("document_bundle.delete.failed", { error, businessId, bundleId });
      res.status(500).json({ message: "Failed to delete Document Bundle" });
    }
  };
}

export function isValidUpsertDocumentBundleRequest(
  request: Partial<UpsertDocumentBundleRequestDto> | undefined
): request is UpsertDocumentBundleRequestDto {
  if (!request
    || typeof request.name !== "string"
    || request.name.trim().length === 0
    || request.name.trim().length > DOCUMENT_BUNDLE_NAME_MAX_LENGTH
    || !validOptionalText(request.description, DOCUMENT_BUNDLE_DESCRIPTION_MAX_LENGTH)
    || !Array.isArray(request.items)) {
    return false;
  }

  const schemaIds = new Set<number>();
  for (const item of request.items) {
    if (!item
      || typeof item !== "object"
      || !positiveInteger(item.schemaId)
      || typeof item.required !== "boolean"
      || (item.quantity !== undefined
        && (!positiveInteger(item.quantity) || item.quantity > DOCUMENT_BUNDLE_QUANTITY_MAX))
      || !validOptionalText(item.label, DOCUMENT_BUNDLE_LABEL_MAX_LENGTH)
      || !Number.isInteger(item.position)
      || item.position < 0
      || schemaIds.has(item.schemaId)) {
      return false;
    }
    schemaIds.add(item.schemaId);
  }
  return true;
}

function normalizeRequest(request: UpsertDocumentBundleRequestDto): UpsertDocumentBundleRequestDto {
  return {
    name: request.name.trim(),
    description: request.description?.trim() || null,
    items: request.items.map((item) => ({
      schemaId: item.schemaId,
      required: item.required,
      quantity: item.quantity ?? 1,
      label: item.label?.trim() || null,
      position: item.position
    }))
  };
}

function sendMutationFailure(res: express.Response, result: DocumentBundleMutationResult) {
  if (result.outcome === "schemas_not_found") {
    return res.status(404).json({
      code: "NOT_FOUND",
      message: "One or more Schemas are not accessible",
      schemaIds: result.schemaIds
    });
  }
  return res.status(404).json({ code: "NOT_FOUND", message: "Document Bundle not found" });
}

function authenticatedBusinessId(req: AuthenticatedRequest, res: express.Response): number | null {
  const businessId = Number(req.header("X-Business-Id"));
  if (!Number.isInteger(businessId) || businessId <= 0) {
    res.status(400).json({ code: "VALIDATION_ERROR", message: "X-Business-Id is required" });
    return null;
  }
  return requireBusinessAccess(req, res, businessId) ? businessId : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function positiveIdParam(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined
    || value === null
    || (typeof value === "string" && value.trim().length <= maxLength);
}

function invalidBundleId(res: express.Response) {
  return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid bundleId" });
}

function invalidBundleRequest(res: express.Response) {
  return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid Document Bundle request" });
}