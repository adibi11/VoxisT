import express from "express";
import {
  BusinessFollowUpPolicyDto,
  CreateConversationFollowUpRequestDto,
  FollowUpStatusDto,
  UpdateConversationFollowUpRequestDto,
  UpdateConversationFollowUpStateRequestDto,
  UpsertBusinessFollowUpPolicyRequestDto
} from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import { AuthenticatedRequest, requireAuth, requireBusinessOwner } from "../authMiddleware";

const FOLLOW_UP_STATUSES = new Set<FollowUpStatusDto>([
  "PENDING",
  "PROCESSING",
  "SENT",
  "SKIPPED",
  "FAILED",
  "CANCELED"
]);

export function createGetFollowUpPolicyHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = parseId(req.params.businessId);
      if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
      if (!requireBusinessOwner(authReq, res, businessId)) return;

      const policy = await sql.followUpRepository.getBusinessFollowUpPolicy(businessId);
      logger.info("follow_up.policy.fetch.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        found: Boolean(policy)
      });
      return res.status(200).json(policy);
    } catch (error) {
      logger.error("follow_up.policy.fetch.failed", { error });
      return res.status(500).json({ message: "Failed to fetch follow-up policy" });
    }
  };
}

export function createUpdateFollowUpPolicyHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = parseId(req.params.businessId);
      if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
      if (!requireBusinessOwner(authReq, res, businessId)) return;

      const request = req.body as UpsertBusinessFollowUpPolicyRequestDto;
      if (!isValidPolicyRequest(request)) {
        return res.status(400).json({ message: "Invalid follow-up policy request" });
      }

      const currentPolicy = await sql.followUpRepository.getBusinessFollowUpPolicy(businessId);
      const casePolicyError = validateCaseDocumentFollowUpPolicy(request, currentPolicy);
      if (casePolicyError) return res.status(400).json({ message: casePolicyError });

      const policy = await sql.followUpRepository.upsertBusinessFollowUpPolicy(businessId, request);
      logger.info("follow_up.policy.upsert.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        policyId: policy.id
      });
      return res.status(200).json(policy);
    } catch (error) {
      logger.error("follow_up.policy.upsert.failed", { error });
      return res.status(500).json({ message: "Failed to save follow-up policy" });
    }
  };
}

export function getFollowUpRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger) {
  app.get(
    "/businesses/:businessId/follow-up/policy",
    requireAuth,
    createGetFollowUpPolicyHandler(sql, logger)
  );
  app.put(
    "/businesses/:businessId/follow-up/policy",
    requireAuth,
    createUpdateFollowUpPolicyHandler(sql, logger)
  );

  app.get("/businesses/:businessId/follow-up/conversations", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = parseId(req.params.businessId);
      if (!businessId) {
        return res.status(400).json({ message: "Invalid businessId" });
      }
      if (!requireBusinessOwner(authReq, res, businessId)) {
        return;
      }

      const conversations = await sql.followUpRepository.getActiveConversationFollowUpStates(businessId);
      logger.info("follow_up.conversations.list.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        count: conversations.length
      });

      return res.status(200).json(conversations);
    } catch (error) {
      logger.error("follow_up.conversations.list.failed", { error });
      return res.status(500).json({ message: "Failed to fetch follow-up conversations" });
    }
  });

  app.get("/businesses/:businessId/follow-up/conversations/:conversationId", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ids = parseBusinessConversationIds(req.params.businessId, req.params.conversationId);
      if (!ids) {
        return res.status(400).json({ message: "Invalid businessId or conversationId" });
      }
      if (!requireBusinessOwner(authReq, res, ids.businessId)) {
        return;
      }

      const state = await sql.followUpRepository.getConversationFollowUpState(ids.businessId, ids.conversationId);
      if (!state) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      return res.status(200).json(state);
    } catch (error) {
      logger.error("follow_up.conversation.fetch.failed", { error });
      return res.status(500).json({ message: "Failed to fetch conversation follow-up state" });
    }
  });

  app.patch("/businesses/:businessId/follow-up/conversations/:conversationId", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ids = parseBusinessConversationIds(req.params.businessId, req.params.conversationId);
      if (!ids) {
        return res.status(400).json({ message: "Invalid businessId or conversationId" });
      }
      if (!requireBusinessOwner(authReq, res, ids.businessId)) {
        return;
      }

      const request = req.body as UpdateConversationFollowUpStateRequestDto;
      if (!isValidConversationFollowUpStateRequest(request)) {
        return res.status(400).json({ message: "Invalid conversation follow-up state request" });
      }

      const existingState = await sql.followUpRepository.getConversationFollowUpState(ids.businessId, ids.conversationId);
      if (!existingState) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const state = await sql.followUpRepository.updateConversationFollowUpState(ids.conversationId, request);
      logger.info("follow_up.conversation.update.succeeded", {
        userId: authReq.auth.userId,
        businessId: ids.businessId,
        conversationId: ids.conversationId
      });

      return res.status(200).json(state);
    } catch (error) {
      logger.error("follow_up.conversation.update.failed", { error });
      return res.status(500).json({ message: "Failed to update conversation follow-up state" });
    }
  });

  app.get("/businesses/:businessId/follow-up/conversations/:conversationId/follow-ups", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ids = parseBusinessConversationIds(req.params.businessId, req.params.conversationId);
      if (!ids) {
        return res.status(400).json({ message: "Invalid businessId or conversationId" });
      }
      if (!requireBusinessOwner(authReq, res, ids.businessId)) {
        return;
      }

      const followUps = await sql.followUpRepository.getConversationFollowUps(ids.businessId, ids.conversationId);
      return res.status(200).json(followUps);
    } catch (error) {
      logger.error("follow_up.conversation_followups.list.failed", { error });
      return res.status(500).json({ message: "Failed to fetch conversation follow-ups" });
    }
  });

  app.post("/businesses/:businessId/follow-up/conversation-follow-ups", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = parseId(req.params.businessId);
      if (!businessId) {
        return res.status(400).json({ message: "Invalid businessId" });
      }
      if (!requireBusinessOwner(authReq, res, businessId)) {
        return;
      }

      const request = req.body as CreateConversationFollowUpRequestDto;
      if (!isValidCreateConversationFollowUpRequest(request)) {
        return res.status(400).json({ message: "Invalid conversation follow-up request" });
      }

      const conversation = await sql.followUpRepository.getConversationFollowUpState(businessId, request.conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const followUp = await sql.followUpRepository.createConversationFollowUp(businessId, request);
      logger.info("follow_up.conversation_followup.create.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        conversationId: followUp.conversationId,
        followUpId: followUp.id
      });

      return res.status(201).json(followUp);
    } catch (error) {
      logger.error("follow_up.conversation_followup.create.failed", { error });
      return res.status(500).json({ message: "Failed to create conversation follow-up" });
    }
  });

  app.patch("/businesses/:businessId/follow-up/conversation-follow-ups/:followUpId", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const ids = parseBusinessFollowUpIds(req.params.businessId, req.params.followUpId);
      if (!ids) {
        return res.status(400).json({ message: "Invalid businessId or followUpId" });
      }
      if (!requireBusinessOwner(authReq, res, ids.businessId)) {
        return;
      }

      const request = req.body as UpdateConversationFollowUpRequestDto;
      if (!isValidUpdateConversationFollowUpRequest(request)) {
        return res.status(400).json({ message: "Invalid conversation follow-up update request" });
      }

      const followUp = await sql.followUpRepository.updateConversationFollowUp(ids.businessId, ids.followUpId, request);
      logger.info("follow_up.conversation_followup.update.succeeded", {
        userId: authReq.auth.userId,
        businessId: ids.businessId,
        followUpId: ids.followUpId
      });

      return res.status(200).json(followUp);
    } catch (error) {
      logger.error("follow_up.conversation_followup.update.failed", { error });
      return res.status(500).json({ message: "Failed to update conversation follow-up" });
    }
  });

  app.delete("/businesses/:businessId/follow-up/conversation-follow-ups", requireAuth, async (req, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const businessId = parseId(req.params.businessId);
      const createdBeforeValue = singleValue(req.query.createdBefore);
      if (!businessId || !createdBeforeValue || !isValidDateString(createdBeforeValue)) {
        return res.status(400).json({ message: "Invalid businessId or createdBefore" });
      }
      if (!requireBusinessOwner(authReq, res, businessId)) {
        return;
      }

      const deletedCount = await sql.followUpRepository.deleteConversationFollowUpsCreatedBefore(
        businessId,
        new Date(createdBeforeValue)
      );
      logger.info("follow_up.conversation_followup.cleanup.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        deletedCount
      });

      return res.status(200).json({ deletedCount });
    } catch (error) {
      logger.error("follow_up.conversation_followup.cleanup.failed", { error });
      return res.status(500).json({ message: "Failed to cleanup conversation follow-ups" });
    }
  });
}

function parseBusinessConversationIds(
  businessIdValue: string | string[],
  conversationIdValue: string | string[]
): { businessId: number; conversationId: number } | null {
  const businessId = parseId(businessIdValue);
  const conversationId = parseId(conversationIdValue);
  return businessId && conversationId ? { businessId, conversationId } : null;
}

function parseBusinessFollowUpIds(
  businessIdValue: string | string[],
  followUpIdValue: string | string[]
): { businessId: number; followUpId: number } | null {
  const businessId = parseId(businessIdValue);
  const followUpId = parseId(followUpIdValue);
  return businessId && followUpId ? { businessId, followUpId } : null;
}

function parseId(value: string | string[]): number | null {
  if (Array.isArray(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isValidPolicyRequest(request: Partial<UpsertBusinessFollowUpPolicyRequestDto> | undefined): request is UpsertBusinessFollowUpPolicyRequestDto {
  if (!request || typeof request !== "object") {
    return false;
  }

  return isValidOptionalBoolean(request.enabled) &&
    isValidOptionalTimeZone(request.timezone) &&
    isValidOptionalNonNegativeNumber(request.delayMinutes) &&
    isValidOptionalHour(request.allowedStartHour) &&
    isValidOptionalHour(request.allowedEndHour) &&
    isValidOptionalNonNegativeNumber(request.maxFollowUps) &&
    isValidOptionalNullableString(request.messageTemplate) &&
    isValidOptionalBoolean(request.caseDocumentFollowUpEnabled) &&
    isValidOptionalHour(request.caseDocumentFollowUpHour);
}

export function validateCaseDocumentFollowUpPolicy(
  request: UpsertBusinessFollowUpPolicyRequestDto,
  currentPolicy: BusinessFollowUpPolicyDto | null
): string | null {
  const timezone = request.timezone?.trim() || currentPolicy?.timezone || "UTC";
  if (!isValidTimeZone(timezone)) {
    return "Invalid IANA timezone";
  }

  const enabled = request.caseDocumentFollowUpEnabled
    ?? currentPolicy?.caseDocumentFollowUpEnabled
    ?? false;
  const hour = request.caseDocumentFollowUpHour === undefined
    ? currentPolicy?.caseDocumentFollowUpHour ?? null
    : request.caseDocumentFollowUpHour;

  if (enabled && hour === null) {
    return "caseDocumentFollowUpHour is required when Case document follow-ups are enabled";
  }
  return null;
}

function isValidConversationFollowUpStateRequest(
  request: Partial<UpdateConversationFollowUpStateRequestDto> | undefined
): request is UpdateConversationFollowUpStateRequestDto {
  if (!request || typeof request !== "object" || Object.keys(request).length === 0) {
    return false;
  }

  return isValidOptionalDateOrNull(request.lastUserMessageAt) &&
    isValidOptionalDateOrNull(request.lastBotMessageAt) &&
    isValidOptionalDateOrNull(request.lastFollowUpAt) &&
    isValidOptionalNonNegativeNumber(request.followUpCount) &&
    isValidOptionalDateOrNull(request.nextFollowUpAt);
}

function isValidCreateConversationFollowUpRequest(
  request: Partial<CreateConversationFollowUpRequestDto> | undefined
): request is CreateConversationFollowUpRequestDto {
  if (!request || typeof request !== "object") {
    return false;
  }

  const conversationId = request.conversationId;
  return typeof conversationId === "number" &&
    Number.isInteger(conversationId) &&
    conversationId > 0 &&
    isValidOptionalNumberOrNull(request.leadId) &&
    isValidOptionalFollowUpStatus(request.status) &&
    typeof request.scheduledFor === "string" &&
    isValidDateString(request.scheduledFor) &&
    isValidOptionalDateOrNull(request.sentAt) &&
    isValidOptionalNullableString(request.skippedReason) &&
    isValidOptionalNullableString(request.messageBody);
}

function isValidUpdateConversationFollowUpRequest(
  request: Partial<UpdateConversationFollowUpRequestDto> | undefined
): request is UpdateConversationFollowUpRequestDto {
  if (!request || typeof request !== "object" || Object.keys(request).length === 0) {
    return false;
  }

  return isValidOptionalNumberOrNull(request.leadId) &&
    isValidOptionalFollowUpStatus(request.status) &&
    isValidOptionalDate(request.scheduledFor) &&
    isValidOptionalDateOrNull(request.sentAt) &&
    isValidOptionalNullableString(request.skippedReason) &&
    isValidOptionalNullableString(request.messageBody);
}

function isValidOptionalFollowUpStatus(status?: FollowUpStatusDto): boolean {
  return status === undefined || FOLLOW_UP_STATUSES.has(status);
}

function isValidOptionalBoolean(value?: boolean): boolean {
  return value === undefined || typeof value === "boolean";
}

function isValidOptionalTimeZone(value?: string): boolean {
  return value === undefined || (typeof value === "string" && isValidTimeZone(value.trim()));
}

export function isValidTimeZone(value: string): boolean {
  if (!value) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function isValidOptionalNullableString(value?: string | null): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isValidOptionalNonNegativeNumber(value?: number): boolean {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

function isValidOptionalNumberOrNull(value?: number | null): boolean {
  return value === undefined || value === null || (Number.isInteger(value) && value > 0);
}

function isValidOptionalHour(value?: number | null): boolean {
  return value === undefined || value === null || (Number.isInteger(value) && value >= 0 && value <= 23);
}

function isValidOptionalDate(value?: string): boolean {
  return value === undefined || isValidDateString(value);
}

function isValidOptionalDateOrNull(value?: string | null): boolean {
  return value === undefined || value === null || value === "" || isValidDateString(value);
}

function isValidDateString(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

function singleValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}
