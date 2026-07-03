import express from "express";
import {
  CreateManualLeadRequestDto,
  LeadSourceDto,
  LeadStatusDto,
  UpdateLeadRequestDto
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

export function getLeadRoutes(app: express.Application, sql: IDatabaseClient, logger: ILogger) {
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
  businessIdValue: string | string[],
  leadIdValue: string | string[]
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

  if (!request.clientId && !hasText(request.name) && !hasText(request.phoneNumber)) {
    return false;
  }

  return isValidLeadStatus(request.status) &&
    isValidLeadSource(request.source) &&
    isValidOptionalNumber(request.clientId) &&
    isValidOptionalNumber(request.memberId) &&
    isValidOptionalNumber(request.score);
}

function isValidUpdateLeadRequest(request: Partial<UpdateLeadRequestDto> | undefined): request is UpdateLeadRequestDto {
  if (!request || typeof request !== "object" || Object.keys(request).length === 0) {
    return false;
  }

  return isValidLeadStatus(request.status) &&
    isValidOptionalNumber(request.memberId) &&
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

function hasText(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
