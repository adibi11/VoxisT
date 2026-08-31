import express from "express";
import { DocumentViewUrlResponseDto, VerifyDocumentResponseDto } from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { IDocumentRepository } from "../../dataClients/SqlClient/Repositories/DocumentRepo/IDocumentRepository";
import { ILogger } from "../../logging/logger";
import { IDocumentStorage } from "../../Storage/DocumentStorage/IDocumentStorage";
import { documentStorageConfigFromEnv, S3DocumentStorage } from "../../Storage/DocumentStorage/S3DocumentStorage";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess } from "../authMiddleware";

export const DOCUMENT_VIEW_URL_TTL_SECONDS = 300;

export function getDocumentRoutes(
  app: express.Router,
  sql: IDatabaseClient,
  logger: ILogger,
  documentStorage?: IDocumentStorage
): void {
  app.get(
    "/documents/:documentId/view-url",
    requireAuth,
    createDocumentViewUrlHandler(sql.documentRepository, logger, documentStorage)
  );
  app.post(
    "/cases/:caseId/documents/:documentId/verify",
    requireAuth,
    verifyDocumentHandler(sql.documentRepository, logger)
  );
}

export function verifyDocumentHandler(
  documents: IDocumentRepository,
  logger: ILogger
): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.header("X-Business-Id"));
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "X-Business-Id is required" });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) return;

    const caseId = Number(req.params.caseId);
    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(caseId) || caseId <= 0 || !Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid caseId or documentId" });
    }

    try {
      const result = await documents.verifyNeedsReviewDocument(businessId, caseId, documentId);
      if (result === "not_found") {
        return res.status(404).json({ code: "NOT_FOUND", message: "Case or document not found" });
      }
      if (result === "not_reviewable") {
        return res.status(409).json({ code: "CONFLICT", message: "Document is not awaiting review" });
      }

      const response: VerifyDocumentResponseDto = { id: documentId, status: "VERIFIED" };
      logger.info("document.verify.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        caseId,
        documentId
      });
      return res.status(200).json(response);
    } catch (error) {
      logger.error("document.verify.failed", { error, businessId, caseId, documentId });
      return res.status(500).json({ message: "Failed to verify document" });
    }
  };
}

export function createDocumentViewUrlHandler(
  documents: IDocumentRepository,
  logger: ILogger,
  documentStorage?: IDocumentStorage
): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.header("X-Business-Id"));
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "X-Business-Id is required" });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) return;

    const documentId = Number(req.params.documentId);
    if (!Number.isInteger(documentId) || documentId <= 0) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid documentId" });
    }

    try {
      const document = await documents.findViewableById(businessId, documentId);
      if (!document) {
        return res.status(404).json({ code: "NOT_FOUND", message: "Document not found" });
      }
      const storage = documentStorage ?? new S3DocumentStorage(documentStorageConfigFromEnv());
      const url = await storage.createViewUrl({
        storageKey: document.storageKey,
        expiresInSeconds: DOCUMENT_VIEW_URL_TTL_SECONDS
      });
      const response: DocumentViewUrlResponseDto = {
        url,
        expiresInSeconds: DOCUMENT_VIEW_URL_TTL_SECONDS,
        mimeType: document.mimeType,
        filename: document.filename
      };
      logger.info("document.view_url.created", { userId: authReq.auth.userId, businessId, documentId });
      return res.status(200).json(response);
    } catch (error) {
      logger.error("document.view_url.failed", { error, businessId, documentId });
      return res.status(500).json({ message: "Failed to create document view URL" });
    }
  };
}
