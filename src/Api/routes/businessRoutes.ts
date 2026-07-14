import express from 'express';
import {
  BusinessActionTypeDto,
  BusinessChannelOnboardingTypeDto,
  BusinessChannelStatusDto,
  UpdateBusinessSettingsRequestDto,
  UpsertBusinessChannelRequestDto
} from '../../contracts';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ILogger } from '../../logging/logger';
import { requireAuth, AuthenticatedRequest, requireBusinessAccess, requirePlatformAdmin } from '../authMiddleware';

    
const BUSINESS_ACTION_TYPES = new Set<BusinessActionTypeDto>([
  "BOOK_APPOINTMENT",
  "SEND_PAYMENT_LINK",
  "SEND_VIDEO",
  "HUMAN_HANDOFF",
  "SEND_EMAIL",
  "NONE"
]);

const BUSINESS_CHANNEL_STATUSES = new Set<BusinessChannelStatusDto>([
  "pending",
  "active",
  "disabled",
  "failed"
]);

const BUSINESS_CHANNEL_ONBOARDING_TYPES = new Set<BusinessChannelOnboardingTypeDto>([
  "manual",
  "embedded_signup",
  "oauth"
]);

export function getBusinessRoutes(app:express.Application, sql: IDatabaseClient, logger: ILogger) {
    app.get("/businesses/:businessId/metrics/response-time", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }

        const from = parseOptionalDateQuery(req.query.from) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const to = parseOptionalDateQuery(req.query.to) || new Date();
        const metrics = await sql.getBusinessResponseMetrics(businessId, from, to);
        logger.info("business.metrics.response_time.fetch.succeeded", {
          userId: authReq.auth.userId,
          businessId,
          responsePairCount: metrics.responsePairCount
        });
        return res.status(200).json(metrics);
      } catch (error) {
        logger.error("business.metrics.response_time.fetch.failed", { error });
        return res.status(500).json({ message: "Failed to fetch business response metrics" });
      }
    });

    app.get("/businesses/:businessId/channels", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }

        const channels = await sql.businessChannelRepository.GetChannelsByBusinessId(businessId);
        logger.info("business.channels.fetch.succeeded", {
          userId: authReq.auth.userId,
          businessId,
          count: channels.length
        });
        return res.status(200).json({ channels });
      } catch (error) {
        logger.error("business.channels.fetch.failed", { error });
        return res.status(500).json({ message: "Failed to fetch business channels" });
      }
    });

    app.post("/businesses/:businessId/channels", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }

        const request = req.body as Partial<UpsertBusinessChannelRequestDto>;
        if (!isValidUpsertBusinessChannelRequest(request)) {
          return res.status(400).json({ message: "Invalid business channel request" });
        }

        const channel = await sql.businessChannelRepository.UpsertChannelByBusinessId(businessId, request);
        logger.info("business.channels.upsert.succeeded", {
          userId: authReq.auth.userId,
          businessId,
          channelId: channel.id,
          channel: channel.channel,
          provider: channel.provider
        });
        return res.status(200).json(channel);
      } catch (error) {
        logger.error("business.channels.upsert.failed", { error });
        return res.status(500).json({ message: "Failed to upsert business channel" });
      }
    });

    app.get("/businesses/:businessId/settings", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }

        const settings = await sql.getBusinessSettings(businessId);
        if (!settings) {
          return res.status(404).json({ message: "Business not found" });
        }

        logger.info("business.settings.fetch.succeeded", {
          userId: authReq.auth.userId,
          businessId
        });
        return res.status(200).json(settings);
      } catch (error) {
        logger.error("business.settings.fetch.failed", { error });
        return res.status(500).json({ message: "Failed to fetch business settings" });
      }
    });

    app.post("/businesses/:businessId/settings", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isFinite(businessId)) {
          return res.status(400).json({ message: "Invalid businessId" });
        }
        if (!requireBusinessAccess(authReq, res, businessId)) {
          return;
        }

        const request = req.body as Partial<UpdateBusinessSettingsRequestDto>;
        if (!isValidUpdateBusinessSettingsRequest(request)) {
          return res.status(400).json({ message: "Invalid business settings request" });
        }

        const settings = await sql.updateBusinessSettings(businessId, request);
        logger.info("business.settings.update.succeeded", {
          userId: authReq.auth.userId,
          businessId,
          parameterCount: settings.parameters.length
        });
        return res.status(200).json(settings);
      } catch (error) {
        logger.error("business.settings.update.failed", { error });
        return res.status(500).json({ message: "Failed to update business settings" });
      }
    });

    app.get("/admin/businesses", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) {
          return;
        }
    
        const businesses = await sql.getAllBusinesses();
        logger.info("admin.businesses.list.succeeded", {
          userId: authReq.auth.userId,
          count: businesses.length
        });
        return res.status(200).json(businesses);
      } catch (error) {
        logger.error("admin.businesses.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch businesses" });
      }
    });

    app.get("/me/businesses", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businesses = await sql.getBusinessesForUser(authReq.auth.userId);
        logger.info("businesses.list.succeeded", {
          userId: authReq.auth.userId,
          count: businesses.length
        });
        return res.status(200).json(businesses);
      } catch (error) {
        logger.error("businesses.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch businesses" });
      }
    });
    
}

function parseOptionalDateQuery(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isValidUpsertBusinessChannelRequest(
  request: Partial<UpsertBusinessChannelRequestDto> | undefined
): request is UpsertBusinessChannelRequestDto {
  if (!request || typeof request !== "object") {
    return false;
  }

  return hasText(request.channel) &&
    hasText(request.provider) &&
    isOptionalText(request.displayName) &&
    isOptionalBusinessChannelStatus(request.status) &&
    isOptionalBusinessChannelOnboardingType(request.onboardingType) &&
    isOptionalText(request.externalAccountId) &&
    isOptionalText(request.externalPhoneNumberId) &&
    isOptionalText(request.webhookUrl) &&
    isOptionalBoolean(request.isDefault);
}

function isOptionalBusinessChannelStatus(value?: BusinessChannelStatusDto): boolean {
  return value === undefined || BUSINESS_CHANNEL_STATUSES.has(value);
}

function isOptionalBusinessChannelOnboardingType(value?: BusinessChannelOnboardingTypeDto): boolean {
  return value === undefined || BUSINESS_CHANNEL_ONBOARDING_TYPES.has(value);
}

function isValidUpdateBusinessSettingsRequest(
  request: Partial<UpdateBusinessSettingsRequestDto> | undefined
): request is UpdateBusinessSettingsRequestDto {
  if (!request || typeof request !== "object") {
    return false;
  }

  return hasText(request.name) &&
    hasText(request.phone) &&
    hasText(request.email) &&
    hasText(request.starterMessage) &&
    hasText(request.endMessage) &&
    hasText(request.escalationMessage) &&
    isOptionalText(request.language) &&
    Array.isArray(request.parameters) &&
    request.parameters.every((parameter) =>
      parameter &&
      typeof parameter === "object" &&
      isOptionalNumber(parameter.id) &&
      hasText(parameter.paramName) &&
      isOptionalBoolean(parameter.use) &&
      isOptionalText(parameter.paramValue)
    ) &&
    isValidBusinessSettingsAction(request.action);
}

function isValidBusinessSettingsAction(action: UpdateBusinessSettingsRequestDto["action"] | undefined): boolean {
  if (action === undefined || action === null) {
    return true;
  }

  return typeof action === "object" &&
    BUSINESS_ACTION_TYPES.has(action.action) &&
    isOptionalText(action.provider);
}

function hasText(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalText(value?: string | null): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalNumber(value?: number | null): boolean {
  return value === undefined || value === null || Number.isFinite(value);
}

function isOptionalBoolean(value?: boolean | null): boolean {
  return value === undefined || value === null || typeof value === "boolean";
}
