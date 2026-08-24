import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";
import { IBusinessChannelRepository } from "../dataClients/SqlClient/Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import { ICaseFollowUpRepository } from "../dataClients/SqlClient/Repositories/CaseFollowUpRepo/ICaseFollowUpRepository";
import { OutboundMessage, IMessageSender } from "../MessageSender/messageSenderInterface";
import {
  TwilioProviderRejectedError,
  TwilioSendOutcomeUnknownError
} from "../MessageSender/twilioMessageSender";
import { ILogger, logger } from "../logging/logger";
import { PortalAccessService } from "../Portal/PortalAccessService";
import { CaseMissingRequirementResolver } from "./CaseMissingRequirementResolver";
import { CaseFollowUpMessageBuilder } from "./CaseFollowUpMessageBuilder";
import {
  caseDocumentFollowUpCadenceKey,
  caseFollowUpLocalTime
} from "./CaseFollowUpScheduler";
import { isActiveCase, resolveCaseClientPhone } from "./caseFollowUpTypes";

export type CaseFollowUpProcessResult =
  | { outcome: "not_claimed" }
  | { outcome: "accepted"; providerMessageId: string }
  | { outcome: "failed"; code: string }
  | { outcome: "skipped"; code: string }
  | { outcome: "deferred"; code: string };

export class CaseFollowUpWorker {
  constructor(
    private readonly repository: ICaseFollowUpRepository,
    private readonly channelRepository: IBusinessChannelRepository,
    private readonly portalAccessService: Pick<PortalAccessService, "getOrCreateActiveAccess">,
    private readonly smsSender: IMessageSender,
    private readonly missingResolver: CaseMissingRequirementResolver,
    private readonly messageBuilder: CaseFollowUpMessageBuilder,
    private readonly workerLogger: ILogger = logger.child({ component: "CaseFollowUpWorker" }),
    private readonly now: () => Date = () => new Date()
  ) {}

  async process(caseFollowUpId: number): Promise<CaseFollowUpProcessResult> {
    const followUp = await this.repository.claimPending(caseFollowUpId);
    if (!followUp) return { outcome: "not_claimed" };

    try {
      if (followUp.businessId !== followUp.case.businessId) {
        return await this.fail(followUp.id, "TENANT_MISMATCH", "Case ownership validation failed");
      }
      if (!isActiveCase(followUp.case.status, followUp.case.archivedAt)) {
        return await this.skip(followUp.id, "CASE_INACTIVE", "Case is no longer active");
      }

      const policy = followUp.case.policy;
      if (!policy?.enabled || policy.hour === null) {
        return await this.skip(followUp.id, "POLICY_DISABLED", "Case document follow-ups are disabled");
      }
      const localTime = caseFollowUpLocalTime(this.now(), policy.timezone);
      if (!localTime) {
        return await this.fail(followUp.id, "POLICY_INVALID", "Case document follow-up timezone is invalid");
      }
      if (followUp.cadenceKey !== caseDocumentFollowUpCadenceKey(localTime.dateKey)) {
        return await this.skip(followUp.id, "POLICY_SCHEDULE_CHANGED", "Case document follow-up schedule changed");
      }
      if (localTime.hour < policy.hour) {
        const minutesUntilHour = Math.max(
          1,
          (policy.hour - localTime.hour) * 60 - localTime.minute
        );
        return await this.defer(
          followUp.id,
          new Date(this.now().getTime() + minutesUntilHour * 60_000)
        );
      }

      const missing = this.missingResolver.resolve(followUp.case.requirements, this.now());
      if (missing.length === 0) {
        return await this.skip(followUp.id, "NO_MISSING_REQUIREMENTS", "No required documents are currently missing");
      }

      const recipient = resolveCaseClientPhone(
        followUp.case.clientPhoneNumber,
        followUp.case.leadPhoneNumber
      );
      if (!recipient) {
        return await this.fail(followUp.id, "RECIPIENT_UNAVAILABLE", "No usable client phone is configured");
      }

      const smsSettings = await this.channelRepository.GetSmsSettings(followUp.businessId);
      const senderId = smsSettings.senderId?.trim();
      if (!smsSettings.enabled || !senderId) {
        return await this.fail(followUp.id, "SMS_NOT_CONFIGURED", "Business SMS is disabled or unconfigured");
      }

      const portalAccess = await this.portalAccessService.getOrCreateActiveAccess(
        followUp.businessId,
        followUp.caseId
      );
      if (!portalAccess?.portalUrl) {
        return await this.fail(followUp.id, "PORTAL_URL_UNAVAILABLE", "Client Portal URL is unavailable");
      }

      const body = this.messageBuilder.build({
        clientName: followUp.case.clientName,
        businessName: followUp.case.businessName,
        portalUrl: portalAccess.portalUrl,
        missingRequirements: missing
      });
      const outboundMessage: OutboundMessage = {
        channel: CommunicationChannel.Sms,
        provider: MessageProvider.Twilio,
        from: senderId,
        to: recipient,
        body,
        businessId: followUp.businessId,
        clientId: followUp.case.clientId ?? undefined
      };
      const sendResult = await this.smsSender.sendMessage(outboundMessage);
      if (!sendResult.providerMessageId) {
        return await this.fail(
          followUp.id,
          "PROVIDER_RESULT_UNKNOWN",
          "Provider acceptance could not be confirmed"
        );
      }

      const acceptedAt = sendResult.sentAt || this.now();
      const persisted = await this.repository.markAccepted(
        followUp.id,
        sendResult.providerMessageId,
        acceptedAt
      );
      if (!persisted) {
        this.workerLogger.error("case_follow_up.accepted.persistence_conflict", {
          caseFollowUpId: followUp.id,
          caseId: followUp.caseId,
          businessId: followUp.businessId,
          providerMessageId: sendResult.providerMessageId
        });
        return { outcome: "failed", code: "PERSISTENCE_CONFLICT" };
      }

      this.workerLogger.info("case_follow_up.accepted", {
        caseFollowUpId: followUp.id,
        caseId: followUp.caseId,
        businessId: followUp.businessId,
        missingRequirementCount: missing.length,
        providerMessageId: sendResult.providerMessageId
      });
      return { outcome: "accepted", providerMessageId: sendResult.providerMessageId };
    } catch (error) {
      const failure = classifyFailure(error);
      await this.repository.markFailed(followUp.id, failure.code, failure.reason);
      this.workerLogger.error("case_follow_up.failed", {
        caseFollowUpId: followUp.id,
        caseId: followUp.caseId,
        businessId: followUp.businessId,
        failureCode: failure.code,
        providerStatus: failure.providerStatus
      });
      return { outcome: "failed", code: failure.code };
    }
  }

  private async fail(id: number, code: string, reason: string): Promise<CaseFollowUpProcessResult> {
    await this.repository.markFailed(id, code, reason);
    this.workerLogger.warn("case_follow_up.not_sent", { caseFollowUpId: id, failureCode: code });
    return { outcome: "failed", code };
  }

  private async defer(id: number, scheduledFor: Date): Promise<CaseFollowUpProcessResult> {
    await this.repository.defer(id, scheduledFor);
    this.workerLogger.info("case_follow_up.deferred", {
      caseFollowUpId: id,
      reasonCode: "POLICY_HOUR_NOT_REACHED"
    });
    return { outcome: "deferred", code: "POLICY_HOUR_NOT_REACHED" };
  }

  private async skip(id: number, code: string, reason: string): Promise<CaseFollowUpProcessResult> {
    await this.repository.markSkipped(id, code, reason);
    this.workerLogger.info("case_follow_up.skipped", { caseFollowUpId: id, reasonCode: code });
    return { outcome: "skipped", code };
  }
}

function sanitizedProviderCode(providerCode: string | undefined): string {
  return providerCode && /^[A-Za-z0-9_-]{1,32}$/.test(providerCode)
    ? `TWILIO_REJECTED_${providerCode}`
    : "TWILIO_REJECTED";
}

function classifyFailure(error: unknown): {
  code: string;
  reason: string;
  providerStatus?: number;
} {
  if (error instanceof TwilioProviderRejectedError) {
    return {
      code: sanitizedProviderCode(error.providerCode),
      reason: "Twilio rejected the SMS request",
      providerStatus: error.status
    };
  }
  if (error instanceof TwilioSendOutcomeUnknownError) {
    return {
      code: "PROVIDER_RESULT_UNKNOWN",
      reason: "SMS submission outcome is unknown and will not be retried automatically"
    };
  }
  return {
    code: "SEND_FAILED",
    reason: "SMS could not be sent"
  };
}
