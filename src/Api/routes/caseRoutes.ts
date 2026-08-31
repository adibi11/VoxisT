import express from "express";
import {
  CreateBusinessDocumentTypeRequestDto,
  CreateBusinessSchemaRequestDto,
  CreateCaseCommentRequestDto,
  CreateCaseRequestDto,
  CreateDocumentUploadRequestDto
} from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { DocumentUploadService, isValidDocumentUploadRequest } from "../../Documents/DocumentUploadService";
import { IDocumentStorage } from "../../Storage/DocumentStorage/IDocumentStorage";
import { S3DocumentStorage, documentStorageConfigFromEnv } from "../../Storage/DocumentStorage/S3DocumentStorage";
import { CaseInboundEmailService } from "../../InboundEmail/CaseInboundEmailService";
import { inboundEmailDomainFromEnv } from "../../InboundEmail/InboundEmailConfig";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess, requirePlatformAdmin } from "../authMiddleware";

export function getCaseRoutes(
  app: express.Router,
  sql: IDatabaseClient,
  logger: ILogger,
  documentStorage?: IDocumentStorage
) {
  app.post("/admin/cases/document-types", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!requirePlatformAdmin(authReq, res)) return;
    const request = req.body as Partial<CreateBusinessDocumentTypeRequestDto>;
    if (!isValidCreateBusinessDocumentTypeRequest(request)) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid system document type request" });
    }
    try {
      const documentType = await sql.schemaRepository.createSystemDocumentType({
        name: request.name.trim(),
        category: request.category?.trim() || null
      });
      logger.info("admin.case.document_type.create.succeeded", {
        userId: authReq.auth.userId,
        documentTypeId: documentType.id
      });
      return res.status(201).json(documentType);
    } catch (error) {
      logger.error("admin.case.document_type.create.failed", { error });
      return res.status(500).json({ message: "Failed to create system document type" });
    }
  });

  app.post("/admin/cases/schemas", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!requirePlatformAdmin(authReq, res)) return;
    const request = req.body as Partial<CreateBusinessSchemaRequestDto>;
    if (!isValidCreateBusinessSchemaRequest(request)) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid system schema request" });
    }
    try {
      const schema = await sql.schemaRepository.createSystemSchema(request);
      if (!schema) {
        return res.status(404).json({ code: "NOT_FOUND", message: "System DocumentType not found" });
      }
      logger.info("admin.case.schema.create.succeeded", {
        userId: authReq.auth.userId,
        schemaId: schema.id,
        documentTypeId: request.documentTypeId
      });
      return res.status(201).json(schema);
    } catch (error) {
      logger.error("admin.case.schema.create.failed", { error });
      return res.status(500).json({ message: "Failed to create system schema" });
    }
  });

  app.post("/cases", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    if (!businessId) return;

    const request = req.body as Partial<CreateCaseRequestDto>;
    if (!isValidCreateCaseRequest(request)) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Invalid Case request"
      });
    }

    try {
      const result = await sql.caseRepository.createCase(businessId, {
        ...request,
        name: request.name.trim(),
        documentSpecifications: request.documentSpecifications.map((specification) => ({
          ...specification,
          label: specification.label?.trim() || null
        }))
      });
      if (result.outcome === "lead_not_found") {
        return res.status(404).json({ code: "NOT_FOUND", message: "Lead not found" });
      }
      if (result.outcome === "assignee_not_found") {
        return res.status(404).json({ code: "NOT_FOUND", message: "Assignee is not a Business member" });
      }
      if (result.outcome === "schemas_not_found") {
        return res.status(404).json({
          code: "NOT_FOUND",
          message: "One or more Schemas are not accessible",
          schemaIds: result.schemaIds
        });
      }

      logger.info("case.create.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        caseId: result.case.id
      });
      return res.status(201).json(result.case);
    } catch (error) {
      logger.error("case.create.failed", { error, businessId });
      return res.status(500).json({ message: "Failed to create Case" });
    }
  });

  app.get("/cases", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    if (!businessId) return;

    try {
      return res.status(200).json(await sql.caseRepository.listCases(businessId));
    } catch (error) {
      logger.error("case.list.failed", { error, businessId });
      return res.status(500).json({ message: "Failed to list Cases" });
    }
  });

  app.post("/cases/document-types", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    if (!businessId) return;

    const request = req.body as Partial<CreateBusinessDocumentTypeRequestDto>;
    if (!isValidCreateBusinessDocumentTypeRequest(request)) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Invalid custom document type request"
      });
    }

    try {
      const documentType = await sql.schemaRepository.createBusinessDocumentType(businessId, {
        name: request.name.trim(),
        category: request.category?.trim() || null
      });
      logger.info("case.document_type.create.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        documentTypeId: documentType.id
      });
      return res.status(201).json(documentType);
    } catch (error) {
      logger.error("case.document_type.create.failed", { error, businessId });
      return res.status(500).json({ message: "Failed to create custom document type" });
    }
  });

  app.get("/cases/document-types", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    if (!businessId) return;

    try {
      const documentTypes = await sql.schemaRepository.getBusinessDocumentTypes(businessId);
      return res.status(200).json(documentTypes);
    } catch (error) {
      logger.error("case.document_type.list.failed", { error, businessId });
      return res.status(500).json({ message: "Failed to list custom document types" });
    }
  });

  app.get("/cases/schemas", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    if (!businessId) return;
    try {
      const schemas = await sql.schemaRepository.getBusinessSchemas(businessId);
      return res.status(200).json(schemas);
    } catch (error) {
      logger.error("case.schema.list.failed", { error, businessId });
      return res.status(500).json({ message: "Failed to list custom schemas" });
    }
  });

  app.post("/cases/schemas", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = Number(req.header("X-Business-Id"));
    if (!Number.isInteger(businessId) || businessId <= 0) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "X-Business-Id is required"
      });
    }
    if (!requireBusinessAccess(authReq, res, businessId)) {
      return;
    }

    const request = req.body as Partial<CreateBusinessSchemaRequestDto>;
    if (!isValidCreateBusinessSchemaRequest(request)) {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: "Invalid custom schema request"
      });
    }

    try {
      const schema = await sql.schemaRepository.createBusinessSchema(businessId, request);
      if (!schema) {
        return res.status(404).json({
          code: "NOT_FOUND",
          message: "DocumentType not found"
        });
      }

      logger.info("case.schema.create.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        schemaId: schema.id,
        documentTypeId: request.documentTypeId
      });
      return res.status(201).json(schema);
    } catch (error) {
      logger.error("case.schema.create.failed", { error, businessId });
      return res.status(500).json({ message: "Failed to create custom schema" });
    }
  });

  app.put("/cases/:caseId/inbound-email-address", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    const caseId = Number(req.params.caseId);
    if (!businessId) return;
    if (!positiveId(caseId)) return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid caseId" });
    try {
      const service = new CaseInboundEmailService(sql.inboundEmailRepository, inboundEmailDomainFromEnv());
      const emailAddress = await service.getOrCreateAddress(businessId, caseId);
      if (!emailAddress) return res.status(404).json({ code: "NOT_FOUND", message: "Case not found" });
      logger.info("case.inbound_email.created", { userId: authReq.auth.userId, businessId, caseId });
      return res.status(200).json({ emailAddress });
    } catch (error) {
      logger.error("case.inbound_email.create.failed", { error, businessId, caseId });
      return res.status(500).json({ message: "Failed to create inbound email address" });
    }
  });

  app.post("/cases/:caseId/documents/upload-request", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    const caseId = Number(req.params.caseId);
    if (!businessId) return;
    if (!positiveId(caseId)) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid caseId" });
    }
    const request = req.body as Partial<CreateDocumentUploadRequestDto>;
    if (!isValidDocumentUploadRequest(request)) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid document upload request" });
    }

    try {
      const storage = documentStorage ?? new S3DocumentStorage(documentStorageConfigFromEnv());
      const result = await new DocumentUploadService(sql.documentRepository, storage)
        .prepareUpload(businessId, caseId, { source: "ADVISOR_UPLOAD", uploadedById: authReq.auth.userId }, request);
      if (result.outcome === "not_found") {
        return res.status(404).json({ code: "NOT_FOUND", message: "Case or document specification not found" });
      }
      logger.info("case.document.upload_request.succeeded", {
        userId: authReq.auth.userId, businessId, caseId, documentId: result.response.document.id
      });
      return res.status(201).json(result.response);
    } catch (error) {
      logger.error("case.document.upload_request.failed", { error, businessId, caseId });
      return res.status(500).json({ message: "Failed to prepare document upload" });
    }
  });

  app.post("/cases/:caseId/comments", requireAuth, createCaseCommentHandler(sql, logger));
  app.get("/cases/:caseId/comments", requireAuth, getCaseCommentsHandler(sql, logger));
  // Keep this parameter route after all static /cases/* routes.
  app.get("/cases/:caseId", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    const caseId = Number(req.params.caseId);
    if (!businessId) return;
    if (!positiveId(caseId)) {
      return res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid caseId" });
    }

    try {
      const details = await sql.caseRepository.getCaseDetails(businessId, caseId);
      return details
        ? res.status(200).json(details)
        : res.status(404).json({ code: "NOT_FOUND", message: "Case not found" });
    } catch (error) {
      logger.error("case.details.failed", { error, businessId, caseId });
      return res.status(500).json({ message: "Failed to fetch Case" });
    }
  });
}

export function createCaseCommentHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    const caseId = Number(req.params.caseId);
    if (!businessId) return;
    if (!positiveId(caseId)) {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid caseId" });
      return;
    }

    const request = req.body as Partial<CreateCaseCommentRequestDto> | undefined;
    if (!isValidCreateCaseCommentRequest(request)) {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid Case comment request" });
      return;
    }

    try {
      const comment = await sql.caseRepository.createComment(
        businessId,
        caseId,
        authReq.auth.userId,
        { content: request.content.trim() }
      );
      if (!comment) {
        res.status(404).json({ code: "NOT_FOUND", message: "Case not found" });
        return;
      }
      logger.info("case.comment.create.succeeded", {
        userId: authReq.auth.userId, businessId, caseId, commentId: comment.id
      });
      res.status(201).json(comment);
    } catch (error) {
      logger.error("case.comment.create.failed", { error, businessId, caseId });
      res.status(500).json({ message: "Failed to create Case comment" });
    }
  };
}

export function getCaseCommentsHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = authenticatedBusinessId(authReq, res);
    const caseId = Number(req.params.caseId);
    if (!businessId) return;
    if (!positiveId(caseId)) {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid caseId" });
      return;
    }

    try {
      const comments = await sql.caseRepository.getComments(businessId, caseId);
      if (!comments) {
        res.status(404).json({ code: "NOT_FOUND", message: "Case not found" });
        return;
      }
      res.status(200).json(comments);
    } catch (error) {
      logger.error("case.comment.list.failed", { error, businessId, caseId });
      res.status(500).json({ message: "Failed to list Case comments" });
    }
  };
}

export const CASE_COMMENT_MAX_LENGTH = 5000;

export function isValidCreateCaseCommentRequest(
  request: Partial<CreateCaseCommentRequestDto> | undefined
): request is CreateCaseCommentRequestDto {
  return Boolean(
    request
    && typeof request.content === "string"
    && request.content.trim().length > 0
    && request.content.trim().length <= CASE_COMMENT_MAX_LENGTH
  );
}

export function isValidCreateCaseRequest(
  request: Partial<CreateCaseRequestDto> | undefined
): request is CreateCaseRequestDto {
  if (!request
    || !positiveId(request.leadId)
    || typeof request.name !== "string"
    || request.name.trim().length === 0
    || !Array.isArray(request.documentSpecifications)
    || (request.assigneeId !== undefined
      && request.assigneeId !== null
      && !positiveId(request.assigneeId))) {
    return false;
  }

  return request.documentSpecifications.every((specification) =>
    specification !== null
    && typeof specification === "object"
    && positiveId(specification.schemaId)
    && typeof specification.required === "boolean"
    && (specification.label === undefined
      || specification.label === null
      || typeof specification.label === "string")
  );
}

export function isValidCreateBusinessDocumentTypeRequest(
  request: Partial<CreateBusinessDocumentTypeRequestDto> | undefined
): request is CreateBusinessDocumentTypeRequestDto {
  return Boolean(
    request
    && typeof request.name === "string"
    && request.name.trim().length > 0
    && (
      request.category === undefined
      || request.category === null
      || typeof request.category === "string"
    )
  );
}

export function isValidCreateBusinessSchemaRequest(
  request: Partial<CreateBusinessSchemaRequestDto> | undefined
): request is CreateBusinessSchemaRequestDto {
  if (!request) return false;
  return typeof request.documentTypeId === "number"
    && Number.isInteger(request.documentTypeId)
    && request.documentTypeId > 0
    && typeof request.name === "string"
    && request.name.trim().length > 0
    && typeof request.version === "number"
    && Number.isInteger(request.version)
    && request.version > 0
    && isJsonObject(request.requirementSchema);
}

function authenticatedBusinessId(
  req: AuthenticatedRequest,
  res: express.Response
): number | null {
  const businessId = Number(req.header("X-Business-Id"));
  if (!Number.isInteger(businessId) || businessId <= 0) {
    res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "X-Business-Id is required"
    });
    return null;
  }
  return requireBusinessAccess(req, res, businessId) ? businessId : null;
}

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

