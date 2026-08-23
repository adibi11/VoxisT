import express from "express";
import {
  CreateCasePortalAccessResponseDto,
  DocumentViewUrlResponseDto,
  PortalDocumentUploadRequestDto,
  PortalDocumentUploadResponseDto
} from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { DocumentUploadService, isValidDocumentUploadRequest } from "../../Documents/DocumentUploadService";
import { ILogger } from "../../logging/logger";
import { PortalAccessService } from "../../Portal/PortalAccessService";
import {
  findDocumentByPublicId,
  findRequirementByPublicId,
  mapClientPortal,
  portalResourceId
} from "../../Portal/portalMapper";
import { IDocumentStorage } from "../../Storage/DocumentStorage/IDocumentStorage";
import { documentStorageConfigFromEnv, S3DocumentStorage } from "../../Storage/DocumentStorage/S3DocumentStorage";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess } from "../authMiddleware";
import { DOCUMENT_VIEW_URL_TTL_SECONDS } from "./documentRoutes";

const PORTAL_NOT_FOUND = { code: "NOT_FOUND", message: "Portal access or resource not found" };

export function getPortalRoutes(
  app: express.Router,
  sql: IDatabaseClient,
  logger: ILogger,
  publicRateLimiter: express.RequestHandler,
  documentStorage?: IDocumentStorage
): void {
  const access = new PortalAccessService(sql.casePortalAccessRepository);

  app.post(
    "/cases/:caseId/portal-access",
    requireAuth,
    createCasePortalAccessHandler(access, logger)
  );
  app.delete(
    "/cases/:caseId/portal-access",
    requireAuth,
    revokeCasePortalAccessHandler(access, logger)
  );

  app.get(
    "/portal/:accessToken",
    portalNoStore,
    publicRateLimiter,
    getClientPortalHandler(access, logger)
  );
  app.post(
    "/portal/:accessToken/requirements/:requirementId/upload-request",
    portalNoStore,
    publicRateLimiter,
    createPortalUploadRequestHandler(access, sql, documentStorage, logger)
  );
  app.get(
    "/portal/:accessToken/documents/:documentId/view-url",
    portalNoStore,
    publicRateLimiter,
    createPortalDocumentViewUrlHandler(access, sql, documentStorage, logger)
  );
}

export function createCasePortalAccessHandler(
  access: PortalAccessService,
  logger: ILogger
): express.RequestHandler {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    const caseId = positiveId(req.params.caseId);
    if (!businessId) return;
    if (!caseId) return invalidCaseId(res);

    try {
      const created = await access.createAccess(businessId, caseId);
      if (!created) return res.status(404).json({ code: "NOT_FOUND", message: "Case not found" });
      const response: CreateCasePortalAccessResponseDto = {
        accessToken: created.accessToken,
        expiresAt: created.expiresAt.toISOString()
      };
      const portalUrl = portalUrlFromEnv(created.accessToken);
      if (portalUrl) response.portalUrl = portalUrl;
      logger.info("case.portal_access.created", { userId: authReq.auth.userId, businessId, caseId });
      return res.status(201).json(response);
    } catch (error) {
      logger.error("case.portal_access.create.failed", { error, businessId, caseId });
      return res.status(500).json({ message: "Failed to create portal access" });
    }
  };
}

export function revokeCasePortalAccessHandler(
  access: PortalAccessService,
  logger: ILogger
): express.RequestHandler {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    const caseId = positiveId(req.params.caseId);
    if (!businessId) return;
    if (!caseId) return invalidCaseId(res);

    try {
      const result = await access.revokeAccess(businessId, caseId);
      if (result.outcome === "case_not_found") {
        return res.status(404).json({ code: "NOT_FOUND", message: "Case not found" });
      }
      logger.info("case.portal_access.revoked", {
        userId: authReq.auth.userId,
        businessId,
        caseId,
        revokedCount: result.revokedCount
      });
      return res.status(204).send();
    } catch (error) {
      logger.error("case.portal_access.revoke.failed", { error, businessId, caseId });
      return res.status(500).json({ message: "Failed to revoke portal access" });
    }
  };
}

export function getClientPortalHandler(
  access: PortalAccessService,
  logger: ILogger
): express.RequestHandler {
  return async (req, res) => {
    try {
      const resolved = await access.resolveAccess(routeParam(req.params.accessToken));
      if (!resolved) return res.status(404).json(PORTAL_NOT_FOUND);
      return res.status(200).json(mapClientPortal(resolved.case, resolved.tokenHash));
    } catch (error) {
      logger.error("portal.case.fetch.failed", { error });
      return res.status(500).json({ message: "Failed to fetch portal" });
    }
  };
}

export function createPortalUploadRequestHandler(
  access: PortalAccessService,
  sql: IDatabaseClient,
  storage: IDocumentStorage | undefined,
  logger: ILogger
): express.RequestHandler {
  return async (req, res) => {
    const request = req.body as Partial<PortalDocumentUploadRequestDto> | undefined;
    if (!isValidPortalUploadRequest(request)) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid document upload request" });
    }

    try {
      const resolved = await access.resolveAccess(routeParam(req.params.accessToken));
      if (!resolved) return res.status(404).json(PORTAL_NOT_FOUND);
      const requirement = findRequirementByPublicId(
        resolved.case,
        resolved.tokenHash,
        routeParam(req.params.requirementId)
      );
      if (!requirement) return res.status(404).json(PORTAL_NOT_FOUND);

      const documentStorage = storage ?? new S3DocumentStorage(documentStorageConfigFromEnv());
      const result = await new DocumentUploadService(sql.documentRepository, documentStorage).prepareUpload(
        resolved.case.businessId,
        resolved.case.id,
        { source: "CLIENT_PORTAL", uploadedById: null },
        { ...request, caseDocumentSpecificationId: requirement.id }
      );
      if (result.outcome === "not_found") return res.status(404).json(PORTAL_NOT_FOUND);

      const response: PortalDocumentUploadResponseDto = {
        document: {
          ...result.response.document,
          id: portalResourceId(resolved.tokenHash, "document", result.response.document.id)
        },
        upload: result.response.upload
      };
      logger.info("portal.document.upload_request.created", {
        caseId: resolved.case.id,
        documentId: result.response.document.id
      });
      return res.status(201).json(response);
    } catch (error) {
      logger.error("portal.document.upload_request.failed", { error });
      return res.status(500).json({ message: "Failed to prepare document upload" });
    }
  };
}

export function createPortalDocumentViewUrlHandler(
  access: PortalAccessService,
  sql: IDatabaseClient,
  storage: IDocumentStorage | undefined,
  logger: ILogger
): express.RequestHandler {
  return async (req, res) => {
    try {
      const resolved = await access.resolveAccess(routeParam(req.params.accessToken));
      if (!resolved) return res.status(404).json(PORTAL_NOT_FOUND);
      const portalDocument = findDocumentByPublicId(
        resolved.case,
        resolved.tokenHash,
        routeParam(req.params.documentId)
      );
      if (!portalDocument) return res.status(404).json(PORTAL_NOT_FOUND);

      const document = await sql.documentRepository.findViewableByCaseId(
        resolved.case.id,
        portalDocument.id
      );
      if (!document) return res.status(404).json(PORTAL_NOT_FOUND);

      const documentStorage = storage ?? new S3DocumentStorage(documentStorageConfigFromEnv());
      const url = await documentStorage.createViewUrl({
        storageKey: document.storageKey,
        expiresInSeconds: DOCUMENT_VIEW_URL_TTL_SECONDS
      });
      const response: DocumentViewUrlResponseDto = {
        url,
        expiresInSeconds: DOCUMENT_VIEW_URL_TTL_SECONDS,
        mimeType: document.mimeType,
        filename: document.filename
      };
      logger.info("portal.document.view_url.created", {
        caseId: resolved.case.id,
        documentId: document.id
      });
      return res.status(200).json(response);
    } catch (error) {
      logger.error("portal.document.view_url.failed", { error });
      return res.status(500).json({ message: "Failed to create document view URL" });
    }
  };
}

export function portalNoStore(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  next();
}

export function isValidPortalUploadRequest(
  request: Partial<PortalDocumentUploadRequestDto> | undefined
): request is PortalDocumentUploadRequestDto {
  return isValidDocumentUploadRequest(request ? {
    ...request,
    caseDocumentSpecificationId: 1
  } : undefined);
}

export function portalUrlFromEnv(accessToken: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const base = env.PORTAL_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return null;
  const parsed = new URL(base);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("PORTAL_BASE_URL must use HTTP or HTTPS");
  }
  return `${base}/c/${encodeURIComponent(accessToken)}`;
}

function routeParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? "" : value;
}

function authenticatedBusinessId(req: AuthenticatedRequest, res: express.Response): number | null {
  const businessId = Number(req.header("X-Business-Id"));
  if (!Number.isInteger(businessId) || businessId <= 0) {
    res.status(400).json({ code: "VALIDATION_ERROR", message: "X-Business-Id is required" });
    return null;
  }
  return requireBusinessAccess(req, res, businessId) ? businessId : null;
}

function positiveId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function invalidCaseId(res: express.Response) {
  return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid caseId" });
}
