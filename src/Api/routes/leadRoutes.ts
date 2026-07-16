import express from "express";
import {
  AssignLeadRequestDto,
  CreateManualLeadRequestDto,
  CreatePublicLeadRequestDto,
  CreatePublicLeadResponseDto,
  LeadSourceDto,
  LeadStatusDto,
  UpdateLeadRequestDto
  ,UnassignLeadRequestDto
} from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessAccess } from "../authMiddleware";

const LEAD_STATUSES = new Set<LeadStatusDto>([
  "NEW",
  "QUALIFYING",
  "QUALIFIED",
  "ASSIGNED",
  "FOLLOW_UP",
  "WON",
  "LOST",
  "CLOSED"
]);

const LEAD_SOURCES = new Set<LeadSourceDto>([
  "WHATSAPP",
  "MANUAL",
  "FACEBOOK",
  "GOOGLE_ADS",
  "WEBSITE",
  "OTHER"
]);

type BookDemoLeadRequestDto = {
  name: string;
  email: string;
  phone: string;
};

export function getLeadRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger) {
  app.post("/public/leads", async (req, res) => {
    try {
      if (!hasValidPublicLeadCaptureKey(req)) {
        logger.warn("publicLead.create.unauthorized");
        return res.status(401).json({ message: "Invalid lead capture key" });
      }

      const businessId = getDefaultBusinessId();
      const request = req.body as Partial<CreatePublicLeadRequestDto>;
      if (!isValidCreatePublicLeadRequest(request)) {
        return res.status(400).json({ message: "Invalid lead request" });
      }

      const lead = await sql.leadRepository.createManualLead(businessId, {
        name: request.name,
        phoneNumber: request.phoneNumber,
        status: "NEW",
        source: request.source || "WEBSITE",
        summary: request.summary,
        notes: request.notes
      });

      logger.info("publicLead.create.succeeded", {
        businessId,
        leadId: lead.id,
        source: lead.source
      });

      const response: CreatePublicLeadResponseDto = {
        message: "Lead received successfully",
        leadId: lead.id
      };

      return res.status(201).json(response);
    } catch (error) {
      logger.error("publicLead.create.failed", { error });
      return res.status(500).json({ message: "Failed to create lead" });
    }
  });

  app.post("/book-demo/leads", async (req, res) => {
    try {
      const businessId = getBookDemoBusinessId();
      if (businessId === null) {
        logger.error("bookDemoLead.create.missingBusinessId", {
          envVar: "BOOK_DEMO_BUSINESS_ID"
        });
        return res.status(500).json({ message: "Book demo business is not configured" });
      }

      const request = req.body as Partial<BookDemoLeadRequestDto>;
      if (!isValidBookDemoLeadRequest(request)) {
        return res.status(400).json({ message: "Invalid book demo lead request" });
      }

      const name = request.name.trim();
      const email = request.email.trim();
      const phone = request.phone.trim();
      const notes = [
        "Book demo request",
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone}`
      ].join("\n");

      const lead = await sql.leadRepository.createManualLead(businessId, {
        name,
        phoneNumber: phone,
        status: "NEW",
        source: "WEBSITE",
        summary: `Book demo request from ${name}. Email: ${email}.`,
        notes
      });

      logger.info("bookDemoLead.create.succeeded", {
        businessId,
        leadId: lead.id
      });

      return res.status(201).json(lead);
    } catch (error) {
      logger.error("bookDemoLead.create.failed", { error });
      return res.status(500).json({ message: "Failed to create book demo lead" });
    }
  });

  app.get("/businesses/:businessId/leads", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = Number(req.params.businessId);
      if (!Number.isFinite(businessId)) {
        return res.status(400).json({ message: "Invalid businessId" });
      }
      if (!requireBusinessAccess(authReq, res, businessId)) {
        return;
      }

      const leads = await sql.leadRepository.getLeadsByBusiness(businessId);
      logger.info("leads.list.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        count: leads.length
      });

      return res.status(200).json(leads);
    } catch (error) {
      logger.error("leads.list.failed", { error });
      return res.status(500).json({ message: "Failed to fetch leads" });
    }
  });

  app.get("/businesses/:businessId/leads/:leadId", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ids = parseLeadRouteIds(req.params.businessId, req.params.leadId);
      if (!ids) {
        return res.status(400).json({ message: "Invalid businessId or leadId" });
      }
      if (!requireBusinessAccess(authReq, res, ids.businessId)) {
        return;
      }

      const lead = await sql.leadRepository.getLeadById(ids.businessId, ids.leadId);
      if (!lead) {
        return res.status(404).json({ message: "Lead not found" });
      }

      logger.info("lead.fetch.succeeded", {
        userId: authReq.auth.userId,
        businessId: ids.businessId,
        leadId: ids.leadId
      });

      return res.status(200).json(lead);
    } catch (error) {
      logger.error("lead.fetch.failed", { error });
      return res.status(500).json({ message: "Failed to fetch lead" });
    }
  });

  app.post("/businesses/:businessId/leads", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = Number(req.params.businessId);
      if (!Number.isFinite(businessId)) {
        return res.status(400).json({ message: "Invalid businessId" });
      }
      if (!requireBusinessAccess(authReq, res, businessId)) {
        return;
      }

      const request = req.body as CreateManualLeadRequestDto;
      if (!isValidCreateManualLeadRequest(request)) {
        return res.status(400).json({ message: "Invalid lead request" });
      }
      if (request.memberId !== undefined && !(await isAssignableBusinessMember(sql, res, businessId, request.memberId))) return;

      const lead = await sql.leadRepository.createManualLead(businessId, request);
      logger.info("lead.create.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        leadId: lead.id
      });

      return res.status(201).json(lead);
    } catch (error) {
      logger.error("lead.create.failed", { error });
      return res.status(500).json({ message: "Failed to create lead" });
    }
  });

  app.post("/businesses/:businessId/leads/:leadId/claim", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const ids = parseLeadRouteIds(req.params.businessId, req.params.leadId);
    if (!ids) return res.status(400).json({ message: "Invalid businessId or leadId" });
    if (!requireBusinessAccess(authReq, res, ids.businessId)) return;
    if (!(await isAssignableBusinessMember(sql, res, ids.businessId, authReq.auth.userId))) return;

    const result = await sql.leadRepository.compareAndSetAssignee(ids.businessId, ids.leadId, null, authReq.auth.userId);
    return sendAssignmentResult(res, result);
  });

  app.post("/businesses/:businessId/leads/:leadId/assign", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const ids = parseLeadRouteIds(req.params.businessId, req.params.leadId);
    const request = req.body as Partial<AssignLeadRequestDto>;
    if (!ids || !isPositiveId(request.memberId) || !hasExpectedMemberId(request)) {
      return res.status(400).json({ message: "memberId and expectedMemberId are required" });
    }
    if (!requireBusinessAccess(authReq, res, ids.businessId)) return;
    if (!(await isAssignableBusinessMember(sql, res, ids.businessId, request.memberId))) return;

    const result = await sql.leadRepository.compareAndSetAssignee(
      ids.businessId,
      ids.leadId,
      request.expectedMemberId!,
      request.memberId
    );
    return sendAssignmentResult(res, result);
  });

  app.post("/businesses/:businessId/leads/:leadId/unassign", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const ids = parseLeadRouteIds(req.params.businessId, req.params.leadId);
    const request = req.body as Partial<UnassignLeadRequestDto>;
    if (!ids || !isPositiveId(request.expectedMemberId)) {
      return res.status(400).json({ message: "expectedMemberId is required" });
    }
    if (!requireBusinessAccess(authReq, res, ids.businessId)) return;

    const result = await sql.leadRepository.compareAndSetAssignee(
      ids.businessId,
      ids.leadId,
      request.expectedMemberId,
      null
    );
    return sendAssignmentResult(res, result);
  });

  app.patch("/businesses/:businessId/leads/:leadId", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ids = parseLeadRouteIds(req.params.businessId, req.params.leadId);
      if (!ids) {
        return res.status(400).json({ message: "Invalid businessId or leadId" });
      }
      if (!requireBusinessAccess(authReq, res, ids.businessId)) {
        return;
      }

      const request = req.body as UpdateLeadRequestDto;
      if (!isValidUpdateLeadRequest(request)) {
        return res.status(400).json({ message: "Invalid lead update request" });
      }

      const lead = await sql.leadRepository.updateLead(ids.businessId, ids.leadId, request);
      logger.info("lead.update.succeeded", {
        userId: authReq.auth.userId,
        businessId: ids.businessId,
        leadId: ids.leadId
      });

      return res.status(200).json(lead);
    } catch (error) {
      logger.error("lead.update.failed", { error });
      return res.status(500).json({ message: "Failed to update lead" });
    }
  });

  app.delete("/businesses/:businessId/leads/:leadId", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ids = parseLeadRouteIds(req.params.businessId, req.params.leadId);
      if (!ids) {
        return res.status(400).json({ message: "Invalid businessId or leadId" });
      }
      if (!requireBusinessAccess(authReq, res, ids.businessId)) {
        return;
      }

      await sql.leadRepository.deleteLead(ids.businessId, ids.leadId);
      logger.info("lead.delete.succeeded", {
        userId: authReq.auth.userId,
        businessId: ids.businessId,
        leadId: ids.leadId
      });

      return res.status(204).send();
    } catch (error) {
      logger.error("lead.delete.failed", { error });
      return res.status(500).json({ message: "Failed to delete lead" });
    }
  });
}

function parseLeadRouteIds(
  businessIdValue: number | string | string[],
  leadIdValue: number | string | string[]
): { businessId: number; leadId: number } | null {
  if (Array.isArray(businessIdValue) || Array.isArray(leadIdValue)) {
    return null;
  }

  const businessId = Number(businessIdValue);
  const leadId = Number(leadIdValue);
  if (!Number.isFinite(businessId) || !Number.isFinite(leadId)) {
    return null;
  }

  return { businessId, leadId };
}

function isValidCreateManualLeadRequest(request: Partial<CreateManualLeadRequestDto> | undefined): request is CreateManualLeadRequestDto {
  if (!request || typeof request !== "object") {
    return false;
  }

  if (!request.clientId && !hasText(request.phoneNumber)) {
    return false;
  }

  return isValidLeadStatus(request.status) &&
    isValidLeadSource(request.source) &&
    isValidOptionalNumber(request.clientId) &&
    isValidOptionalNumber(request.memberId) &&
    isValidOptionalNumber(request.score);
}

function isValidCreatePublicLeadRequest(request: Partial<CreatePublicLeadRequestDto> | undefined): request is CreatePublicLeadRequestDto {
  if (!request || typeof request !== "object") {
    return false;
  }

  return hasText(request.phoneNumber) &&
    isValidLeadSource(request.source) &&
    isValidOptionalText(request.name) &&
    isValidOptionalText(request.summary) &&
    isValidOptionalText(request.notes);
}

function isValidBookDemoLeadRequest(request: Partial<BookDemoLeadRequestDto> | undefined): request is BookDemoLeadRequestDto {
  if (!request || typeof request !== "object") {
    return false;
  }

  return hasText(request.name) &&
    hasText(request.phone) &&
    typeof request.email === "string" &&
    hasText(request.email) &&
    request.email.includes("@");
}

function getBookDemoBusinessId(): number | null {
  const configuredBusinessId = Number(process.env.BOOK_DEMO_BUSINESS_ID);

  if (!Number.isInteger(configuredBusinessId) || configuredBusinessId <= 0) {
    return null;
  }

  return configuredBusinessId;
}

function getDefaultBusinessId(): number {
  const configuredBusinessId = Number(process.env.DEFAULT_BUSINESS_ID || 1);

  if (!Number.isInteger(configuredBusinessId) || configuredBusinessId <= 0) {
    throw new Error("DEFAULT_BUSINESS_ID must be a positive number");
  }

  return configuredBusinessId;
}

function hasValidPublicLeadCaptureKey(req: express.Request): boolean {
  const configuredKey = process.env.PUBLIC_LEAD_CAPTURE_KEY?.trim();
  if (!configuredKey) {
    return true;
  }

  const providedKey = getHeaderValue(req, "x-lead-capture-key") || req.query.key;
  return typeof providedKey === "string" && providedKey === configuredKey;
}

function getHeaderValue(req: express.Request, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return typeof value === "string" ? value : null;
}

function isValidUpdateLeadRequest(request: Partial<UpdateLeadRequestDto> | undefined): request is UpdateLeadRequestDto {
  if (!request || typeof request !== "object" || Object.keys(request).length === 0) {
    return false;
  }

  return !("memberId" in request) && isValidLeadStatus(request.status) &&
    isValidOptionalNumber(request.score);
}

function isValidLeadStatus(status?: LeadStatusDto): boolean {
  return status === undefined || LEAD_STATUSES.has(status);
}

function isValidLeadSource(source?: LeadSourceDto): boolean {
  return source === undefined || LEAD_SOURCES.has(source);
}

function isValidOptionalNumber(value?: number | null): boolean {
  return value === undefined || value === null || Number.isFinite(value);
}

function isValidOptionalText(value?: string | null): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function hasText(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

async function isAssignableBusinessMember(
  sql: IDatabaseClient,
  res: express.Response,
  businessId: number,
  memberId: number
): Promise<boolean> {
  if (!(await sql.isBusinessMember(memberId, businessId))) {
    res.status(400).json({ message: "Assigned user is not a member of this business" });
    return false;
  }
  return true;
}

function hasExpectedMemberId(request: Partial<AssignLeadRequestDto>): boolean {
  return Object.prototype.hasOwnProperty.call(request, "expectedMemberId") &&
    (request.expectedMemberId === null || isPositiveId(request.expectedMemberId));
}

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function sendAssignmentResult(
  res: express.Response,
  result: Awaited<ReturnType<IDatabaseClient["leadRepository"]["compareAndSetAssignee"]>>
) {
  if (result.outcome === "not_found") return res.status(404).json({ message: "Lead not found" });
  if (result.outcome === "conflict") {
    return res.status(409).json({ message: "Lead assignment changed; refresh and retry", lead: result.lead });
  }
  return res.status(200).json(result.lead);
}
