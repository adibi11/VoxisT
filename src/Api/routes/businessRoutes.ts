import express from "express";
import {
  AdminCreateBusinessRequestDto,
  SmsSettingsDto,
  UpdateSmsSettingsRequestDto,
  UpdateVoiceSettingsRequestDto
} from "../../contracts";
import { IDatabaseClient } from "../../dataClients/SqlClient/sqlInterface";
import { ILogger } from "../../logging/logger";
import {
  ITwilioMessagingServiceProvisioner,
  TwilioMessagingServiceProvisioner,
  TwilioProvisioningError
} from "../../MessageSender/twilioMessagingServiceProvisioner";
import {
  AuthenticatedRequest,
  requireAuth,
  requireBusinessAccess,
  requireBusinessOwner,
  requirePlatformAdmin
} from "../authMiddleware";

export function getBusinessRoutes(app: express.Router, sql: IDatabaseClient, logger: ILogger): void {
  app.get("/businesses/:businessId/sms-settings", requireAuth, createGetSmsSettingsHandler(sql, logger));
  app.put("/businesses/:businessId/sms-settings", requireAuth, createUpdateSmsSettingsHandler(sql, logger));
  app.get("/businesses/:businessId/voice-settings", requireAuth, createGetVoiceSettingsHandler(sql, logger));
  app.put("/businesses/:businessId/voice-settings", requireAuth, createUpdateVoiceSettingsHandler(sql, logger));

  app.post("/admin/businesses", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!requirePlatformAdmin(authReq, res)) return;
    const request = req.body as Partial<AdminCreateBusinessRequestDto>;
    if (!request || !hasText(request.name) || !hasText(request.phone) || !hasText(request.email) || !isOptionalText(request.language)) {
      return res.status(400).json({ message: "Invalid business creation request" });
    }
    try {
      const business = await sql.createBusiness(request as AdminCreateBusinessRequestDto);
      logger.info("admin.business.create.succeeded", { userId: authReq.auth.userId, businessId: business.id });
      return res.status(201).json(business);
    } catch (error) {
      logger.error("admin.business.create.failed", { error });
      return res.status(500).json({ message: "Failed to create business" });
    }
  });

  app.get("/admin/businesses", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!requirePlatformAdmin(authReq, res)) return;
    try {
      return res.status(200).json(await sql.getAllBusinesses());
    } catch (error) {
      logger.error("admin.businesses.list.failed", { error });
      return res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  app.get("/me/businesses", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    try {
      return res.status(200).json(await sql.getBusinessesForUser(authReq.auth.userId));
    } catch (error) {
      logger.error("businesses.list.failed", { error });
      return res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  app.get("/businesses/:businessId/members", requireAuth, async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = positiveBusinessId(req.params.businessId);
    if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
    if (!requireBusinessAccess(authReq, res, businessId)) return;
    try {
      return res.status(200).json(await sql.getBusinessMembers(businessId));
    } catch (error) {
      logger.error("business.members.list.failed", { error });
      return res.status(500).json({ message: "Failed to fetch business members" });
    }
  });
}

export function createGetVoiceSettingsHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = positiveBusinessId(req.params.businessId);
    if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
    if (!requireBusinessOwner(authReq, res, businessId)) return;
    try {
      const settings = await sql.voiceConfigurationRepository.get(businessId);
      return res.status(200).json(settings);
    } catch (error) {
      logger.error("business.voice_settings.fetch.failed", { businessId, error });
      return res.status(500).json({ message: "Failed to fetch voice settings" });
    }
  };
}

export function createUpdateVoiceSettingsHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = positiveBusinessId(req.params.businessId);
    if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
    if (!requirePlatformAdmin(authReq, res)) return;
    const request = req.body as Partial<UpdateVoiceSettingsRequestDto> | undefined;
    if (!isValidVoiceSettingsRequest(request)) {
      return res.status(400).json({ message: "Invalid voice settings request" });
    }
    try {
      const settings = await sql.voiceConfigurationRepository.update(businessId, request);
      return res.status(200).json(settings);
    } catch (error) {
      logger.error("business.voice_settings.update.failed", { businessId, error });
      return res.status(500).json({ message: "Failed to update voice settings" });
    }
  };
}

export function createGetSmsSettingsHandler(sql: IDatabaseClient, logger: ILogger): express.RequestHandler {
  return async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const businessId = positiveBusinessId(req.params.businessId);
    if (!businessId) return res.status(400).json({ message: "Invalid businessId" });
    if (!requireBusinessOwner(authReq, res, businessId)) return;
    try {
      const settings: SmsSettingsDto = await sql.businessChannelRepository.GetSmsSettings(businessId);
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
    if (!isValidSmsSettingsRequest(request)) return res.status(400).json({ message: "Invalid SMS settings request" });

    let newlyProvisionedServiceSid: string | null = null;
    let activeProvisioner = provisioner;
    try {
      if (!request.enabled) {
        return res.status(200).json(await sql.businessChannelRepository.UpdateSmsSettings(businessId, request));
      }

      const senderId = request.senderId!.trim();
      const current = await sql.businessChannelRepository.GetSmsProviderConfiguration(businessId);
      if (current.messagingServiceSid && current.senderId === senderId) {
        return res.status(200).json(await sql.businessChannelRepository.UpdateSmsSettings(businessId, { enabled: true, senderId }));
      }

      activeProvisioner ||= new TwilioMessagingServiceProvisioner({
        logger: logger.child({ component: "TwilioMessagingServiceProvisioner" })
      });
      const resources = await activeProvisioner.provisionBusinessSender(businessId, senderId);
      newlyProvisionedServiceSid = resources.messagingServiceSid;
      const settings = await sql.businessChannelRepository.UpdateSmsSettings(
        businessId,
        { enabled: true, senderId },
        resources
      );
      newlyProvisionedServiceSid = null;
      if (current.messagingServiceSid && current.messagingServiceSid !== resources.messagingServiceSid) {
        await activeProvisioner.deleteMessagingService(current.messagingServiceSid);
      }
      return res.status(200).json(settings);
    } catch (error) {
      if (newlyProvisionedServiceSid && activeProvisioner) {
        await activeProvisioner.deleteMessagingService(newlyProvisionedServiceSid);
      }
      if (error instanceof TwilioProvisioningError) {
        return res.status(502).json({ message: "Failed to configure SMS provider", code: "SMS_PROVIDER_PROVISIONING_FAILED" });
      }
      logger.error("business.sms_settings.update.failed", { businessId, error });
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

export function isValidVoiceSettingsRequest(
  request: Partial<UpdateVoiceSettingsRequestDto> | undefined
): request is UpdateVoiceSettingsRequestDto {
  if (!request || typeof request.enabled !== "boolean" || typeof request.providerEnabled !== "boolean") return false;
  if (request.provider !== "elevenlabs") return false;
  if (request.thresholdDays !== null && (!Number.isInteger(request.thresholdDays) || request.thresholdDays! < 1)) return false;
  if (request.enabled && request.thresholdDays === null) return false;
  if (request.outboundNumberId !== null && typeof request.outboundNumberId !== "string") return false;
  if (request.agentId !== null && typeof request.agentId !== "string") return false;
  if (request.providerEnabled && (!request.outboundNumberId?.trim() || !request.agentId?.trim())) return false;
  return true;
}

function positiveBusinessId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasText(value?: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalText(value?: string | null): boolean {
  return value === undefined || value === null || typeof value === "string";
}
