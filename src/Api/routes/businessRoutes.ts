import express from 'express';
import {
  AdminCreateBusinessRequestDto,
  BusinessActionTypeDto,
  BusinessChannelOnboardingTypeDto,
  BusinessChannelStatusDto,
  BusinessParameterTypeDto,
  SmsSettingsDto,
  UpdateBusinessSettingsRequestDto,
  UpdateSmsSettingsRequestDto,
  UpsertBusinessChannelRequestDto
} from '../../contracts';
import { IDatabaseClient } from '../../dataClients/SqlClient/sqlInterface';
import { ILogger } from '../../logging/logger';
import {
  ITwilioMessagingServiceProvisioner,
  TwilioMessagingServiceProvisioner,
  TwilioProvisioningError
} from '../../MessageSender/twilioMessagingServiceProvisioner';
import { requireAuth, AuthenticatedRequest, requireBusinessAccess, requireBusinessOwner, requirePlatformAdmin } from '../authMiddleware';

    
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

const BUSINESS_PARAMETER_TYPES = new Set<BusinessParameterTypeDto>([
  "CATEGORICAL",
  "CONTINUOUS",
  "TIME",
  "TEXT"
]);

export function getBusinessRoutes(app:express.Router, sql: IDatabaseClient, logger: ILogger) {
    app.get("/businesses/:businessId/sms-settings", requireAuth, createGetSmsSettingsHandler(sql, logger));
    app.put("/businesses/:businessId/sms-settings", requireAuth, createUpdateSmsSettingsHandler(sql, logger));
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
        if (!requireBusinessOwner(authReq, res, businessId)) {
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
        if (!requireBusinessOwner(authReq, res, businessId)) {
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
        if (!requireBusinessOwner(authReq, res, businessId)) {
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
        if (!requireBusinessOwner(authReq, res, businessId)) {
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

    app.post("/admin/businesses", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        if (!requirePlatformAdmin(authReq, res)) return;
        const request = req.body as Partial<AdminCreateBusinessRequestDto>;
        if (!request || !hasText(request.name) || !hasText(request.phone) ||
            !hasText(request.email) || !isOptionalText(request.language)) {
          return res.status(400).json({ message: "Invalid business creation request" });
        }
        const business = await sql.createBusiness(request as AdminCreateBusinessRequestDto);
        logger.info("admin.business.create.succeeded", { userId: authReq.auth.userId, businessId: business.id });
        return res.status(201).json(business);
      } catch (error) {
        logger.error("admin.business.create.failed", { error });
        return res.status(500).json({ message: "Failed to create business" });
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

    app.get("/businesses/:businessId/members", requireAuth, async (req, res) => {
      try {
        const authReq = req as AuthenticatedRequest;
        const businessId = Number(req.params.businessId);
        if (!Number.isInteger(businessId) || businessId <= 0) return res.status(400).json({ message: "Invalid businessId" });
        if (!requireBusinessAccess(authReq, res, businessId)) return;
        return res.status(200).json(await sql.getBusinessMembers(businessId));
      } catch (error) {
        logger.error("business.members.list.failed", { error });
        return res.status(500).json({ message: "Failed to fetch business members" });
      }
    });
    
}

export function createGetSmsSettingsHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = positiveBusinessId(req.params.businessId);
    if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
    if (!requireBusinessOwner(authReq, res, businessId)) return;
    try {
      const settings: SmsSettingsDto = await sql.businessChannelRepository.GetSmsSettings(businessId);
      logger.info("business.sms_settings.fetch.succeeded", { userId: authReq.auth.userId, businessId });
      return res.status(200).json(settings);
    } catch (error) {
      logger.error("business.sms_settings.fetch.failed", { error, businessId });
      return res.status(500).json({ message: "Failed to fetch SMS settings" });
    }
  };
}

export function createUpdateSmsSettingsHandler(
  sql: IDatabaseClient,
  logger: ILogger,
  provisioner?: ITwilioMessagingServiceProvisioner
): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = positiveBusinessId(req.params.businessId);
    if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
    if (!requireBusinessOwner(authReq, res, businessId)) return;
    const request = req.body as Partial<UpdateSmsSettingsRequestDto> | undefined;
    if (!isValidSmsSettingsRequest(request)) {
      return res.status(400).json({ message: "Invalid SMS settings request" });
    }

    let newlyProvisionedServiceSid: string | null = null;
    let activeProvisioner: ITwilioMessagingServiceProvisioner | undefined = provisioner;
    try {
      if (!request.enabled) {
        const settings = await sql.businessChannelRepository.UpdateSmsSettings(businessId, request);
        return res.status(200).json(settings);
      }

      const senderId = request.senderId!.trim();
      const current = await sql.businessChannelRepository.GetSmsProviderConfiguration(businessId);
      if (current.messagingServiceSid && current.senderId === senderId) {
        const settings = await sql.businessChannelRepository.UpdateSmsSettings(businessId, {
          enabled: true,
          senderId
        });
        return res.status(200).json(settings);
      }

      const twilioProvisioner = activeProvisioner || new TwilioMessagingServiceProvisioner({
        logger: logger.child({ component: "TwilioMessagingServiceProvisioner" })
      });
      activeProvisioner = twilioProvisioner;
      const resources = await twilioProvisioner.provisionBusinessSender(businessId, senderId);
      newlyProvisionedServiceSid = resources.messagingServiceSid;
      const settings = await sql.businessChannelRepository.UpdateSmsSettings(
        businessId,
        { enabled: true, senderId },
        resources
      );
      newlyProvisionedServiceSid = null;

      if (
        current.messagingServiceSid &&
        current.messagingServiceSid !== resources.messagingServiceSid
      ) {
        await twilioProvisioner.deleteMessagingService(current.messagingServiceSid);
      }

      logger.info("business.sms_settings.update.succeeded", {
        userId: authReq.auth.userId,
        businessId,
        enabled: settings.enabled,
        messagingServiceConfigured: settings.messagingServiceConfigured
      });
      return res.status(200).json(settings);
    } catch (error) {
      if (newlyProvisionedServiceSid && activeProvisioner) {
        await activeProvisioner.deleteMessagingService(newlyProvisionedServiceSid);
      }
      if (error instanceof TwilioProvisioningError) {
        logger.error("business.sms_settings.provisioning.failed", {
          businessId,
          operation: error.operation,
          providerStatus: error.status,
          providerCode: error.providerCode
        });
        return res.status(502).json({
          message: "Failed to configure SMS provider",
          code: "SMS_PROVIDER_PROVISIONING_FAILED"
        });
      }
      logger.error("business.sms_settings.update.failed", { businessId });
      return res.status(500).json({ message: "Failed to update SMS settings" });
    }
  };
}

export function isValidSmsSettingsRequest(
  request: Partial<UpdateSmsSettingsRequestDto> | undefined
): request is UpdateSmsSettingsRequestDto {
  if (!request || typeof request.enabled !== "boolean") return false;
  if (request.senderId !== null && typeof request.senderId !== "string") return false;
  const senderId = request.senderId?.trim() || null;
  if (request.enabled && !senderId) return false;
  return senderId === null || /^[A-Za-z][A-Za-z0-9]{2,10}$/.test(senderId);
}

function positiveBusinessId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
    isOptionalBoolean(request.isDefault) &&
    isOptionalChannelCredentials(request.credentials);
}

// Credentials are provider secrets: optional, but when present each field must
// be a non-empty string and at least one recognized field must be set.
function isOptionalChannelCredentials(value: UpsertBusinessChannelRequestDto["credentials"] | undefined): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const fields = [value.accountSid, value.authToken, value.accessToken, value.phoneNumberId];
  const setFields = fields.filter((field) => field !== undefined);
  return setFields.length > 0 && setFields.every((field) => hasText(field));
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
    isOptionalText(request.starterMessage) &&
    isOptionalText(request.endMessage) &&
    isOptionalText(request.escalationMessage) &&
    isOptionalText(request.language) &&
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

function isOptionalBusinessParameterType(value?: BusinessParameterTypeDto): boolean {
  return value === undefined || BUSINESS_PARAMETER_TYPES.has(value);
}

function isOptionalBusinessParameterConfig(value?: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const config = value as { options?: unknown; min?: unknown; max?: unknown; unit?: unknown };
  const validOptions = config.options === undefined ||
    (Array.isArray(config.options) && config.options.every((option) => typeof option === "string"));

  return validOptions &&
    isOptionalNumber(config.min as number | undefined) &&
    isOptionalNumber(config.max as number | undefined) &&
    isOptionalText(config.unit as string | undefined);
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
