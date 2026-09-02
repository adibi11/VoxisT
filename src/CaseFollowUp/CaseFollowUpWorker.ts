import { CommunicationChannel, MessageProvider } from "../dataClients/Types/apiTypes";
import { IBusinessChannelRepository } from "../dataClients/SqlClient/Repositories/BusinessChannelRepo/IBusinessChannelRepository";
import {
  CaseFollowUpWorkItem,
  ICaseFollowUpRepository
} from "../dataClients/SqlClient/Repositories/CaseFollowUpRepo/ICaseFollowUpRepository";
import { OutboundMessage, IMessageSender } from "../MessageSender/messageSenderInterface";
import {
  TwilioProviderRejectedError,
  TwilioSendOutcomeUnknownError
} from "../MessageSender/twilioMessageSender";
import { ILogger, logger } from "../logging/logger";
import { PortalAccessService } from "../Portal/PortalAccessService";
import { CaseInboundEmailService } from "../InboundEmail/CaseInboundEmailService";
import { CaseMissingRequirementResolver } from "./CaseMissingRequirementResolver";
import { CaseFollowUpMessageBuilder } from "./CaseFollowUpMessageBuilder";
import {
  caseDocumentFollowUpCadenceKey,
  caseFollowUpLocalTime
} from "./CaseFollowUpScheduler";
import { isActiveCase, resolveCaseClientPhone } from "./caseFollowUpTypes";
import { randomUUID } from "node:crypto";
import { CaseFollowUpChannelDecider } from "../Voice/Domain/CaseFollowUpChannelDecider";
import { IVoiceCallContextBuilder } from "../Voice/Context/VoiceCallContext";
import {
  IVoiceCallProvider,
  VoiceProviderOutcomeUnknownError,
  VoiceProviderRejectedError
} from "../Voice/Providers/VoiceCallProvider";
import { IVoiceConfigurationRepository } from "../Voice/State/VoiceConfigurationRepository";
import { VoiceInteractionRepository } from "../Voice/State/VoiceInteractionRepository";

export const CASE_FOLLOW_UP_LEASE_MS = 5 * 60 * 1000;

export type CaseFollowUpVoiceDependencies = {
  configuration: IVoiceConfigurationRepository;
  interactions: VoiceInteractionRepository;
  contextBuilder: IVoiceCallContextBuilder;
  provider: IVoiceCallProvider;
  channelDecider?: CaseFollowUpChannelDecider;
};

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
    private readonly inboundEmailService: Pick<CaseInboundEmailService, "getOrCreateAddress">,
    private readonly smsSender: IMessageSender,
    private readonly missingResolver: CaseMissingRequirementResolver,
    private readonly messageBuilder: CaseFollowUpMessageBuilder,
    private readonly workerLogger: ILogger = logger.child({ component: "CaseFollowUpWorker" }),
    private readonly now: () => Date = () => new Date(),
    private readonly voice?: CaseFollowUpVoiceDependencies
  ) {}

  async process(caseFollowUpId: number): Promise<CaseFollowUpProcessResult> {
    const leaseId = randomUUID();
    const claimedAt = this.now();
    const followUp = await this.repository.claimPending(
      caseFollowUpId,
      leaseId,
      new Date(claimedAt.getTime() + CASE_FOLLOW_UP_LEASE_MS)
    );
    if (!followUp) return { outcome: "not_claimed" };

    try {
      if (followUp.businessId !== followUp.case.businessId) {
        return await this.fail(followUp.id, leaseId, "TENANT_MISMATCH", "Case ownership validation failed");
      }
      if (!isActiveCase(followUp.case.status, followUp.case.archivedAt)) {
        return await this.skip(followUp.id, leaseId, "CASE_INACTIVE", "Case is no longer active");
      }

      const policy = followUp.case.policy;
      if (!policy?.enabled || policy.hour === null) {
        return await this.skip(followUp.id, leaseId, "POLICY_DISABLED", "Case document follow-ups are disabled");
      }
      const localTime = caseFollowUpLocalTime(this.now(), policy.timezone);
      if (!localTime) {
        return await this.fail(followUp.id, leaseId, "POLICY_INVALID", "Case document follow-up timezone is invalid");
      }
      if (followUp.cadenceKey !== caseDocumentFollowUpCadenceKey(localTime.dateKey)) {
        return await this.skip(followUp.id, leaseId, "POLICY_SCHEDULE_CHANGED", "Case document follow-up schedule changed");
      }
      if (localTime.hour < policy.hour) {
        const minutesUntilHour = Math.max(
          1,
          (policy.hour - localTime.hour) * 60 - localTime.minute
        );
        return await this.defer(
          followUp.id,
          leaseId,
          new Date(this.now().getTime() + minutesUntilHour * 60_000)
        );
      }

      const missing = this.missingResolver.resolve(followUp.case.requirements, this.now());
      if (missing.length === 0) {
        return await this.skip(followUp.id, leaseId, "NO_MISSING_REQUIREMENTS", "No required documents are currently missing");
      }

      const recipient = resolveCaseClientPhone(
        followUp.case.clientPhoneNumber,
        followUp.case.leadPhoneNumber
      );
      if (!recipient) {
        return await this.fail(followUp.id, leaseId, "RECIPIENT_UNAVAILABLE", "No usable client phone is configured");
      }

      const voiceConfiguration = this.voice
        ? await this.voice.configuration.get(followUp.businessId)
        : null;
      const decision = (this.voice?.channelDecider ?? new CaseFollowUpChannelDecider()).decide({
        now: this.now(),
        timezone: policy.timezone,
        voiceEnabled: voiceConfiguration?.enabled ?? false,
        voiceConfigured: Boolean(
          this.voice
          && voiceConfiguration?.providerConfigured
          && voiceConfiguration.provider === this.voice.provider.provider
        ),
        thresholdDays: voiceConfiguration?.thresholdDays ?? null,
        lastBorrowerInteractionAt: followUp.case.lastBorrowerInteractionAt,
        firstSuccessfulFollowUpAt: followUp.case.firstSuccessfulFollowUpAt,
        voiceSubmissionUnresolved: followUp.case.voiceSubmissionUnresolved
      });
      if (decision.channel === "voice" && this.voice && voiceConfiguration) {
        return await this.dispatchVoice(followUp, leaseId, recipient, voiceConfiguration);
      }
      return await this.dispatchSms(followUp, leaseId, missing, recipient);
    } catch (error) {
      const failure = classifyFailure(error);
      await this.repository.markFailed(followUp.id, leaseId, failure.code, failure.reason);
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

  private async dispatchVoice(
    followUp: CaseFollowUpWorkItem,
    leaseId: string,
    recipient: string,
    configuration: Awaited<ReturnType<IVoiceConfigurationRepository["get"]>>
  ): Promise<CaseFollowUpProcessResult> {
    if (!followUp || !this.voice || !configuration.provider || !configuration.outboundNumberId || !configuration.agentId) {
      return this.fail(followUp!.id, leaseId, "VOICE_NOT_CONFIGURED", "Business voice configuration is incomplete");
    }
    const context = await this.voice.contextBuilder.build({
      businessId: followUp.businessId,
      caseId: followUp.caseId
    });
    if (!context) {
      return this.fail(followUp.id, leaseId, "VOICE_CONTEXT_UNAVAILABLE", "Voice call context is unavailable");
    }

    // This is the final read before the irreversible provider boundary. It both
    // proves the lease is still live and refreshes every mutable dispatch input.
    const dispatchAt = this.now();
    const fresh = await this.repository.reloadClaimed(followUp.id, leaseId, dispatchAt);
    if (!fresh || fresh.businessId !== fresh.case.businessId) {
      return { outcome: "not_claimed" };
    }
    if (!isActiveCase(fresh.case.status, fresh.case.archivedAt)) {
      return this.skip(fresh.id, leaseId, "CASE_INACTIVE", "Case is no longer active");
    }
    const freshMissing = this.missingResolver.resolve(fresh.case.requirements, dispatchAt);
    if (freshMissing.length === 0) {
      return this.skip(fresh.id, leaseId, "NO_MISSING_REQUIREMENTS", "No required documents are currently missing");
    }
    const freshRecipient = resolveCaseClientPhone(fresh.case.clientPhoneNumber, fresh.case.leadPhoneNumber);
    if (!freshRecipient) {
      return this.fail(fresh.id, leaseId, "RECIPIENT_UNAVAILABLE", "No usable client phone is configured");
    }
    const freshConfiguration = await this.voice.configuration.get(fresh.businessId);
    const freshDecision = (this.voice.channelDecider ?? new CaseFollowUpChannelDecider()).decide({
      now: dispatchAt,
      timezone: fresh.case.policy?.timezone ?? "UTC",
      voiceEnabled: freshConfiguration?.enabled ?? false,
      voiceConfigured: Boolean(
        freshConfiguration?.providerConfigured
        && freshConfiguration.provider === this.voice.provider.provider
      ),
      thresholdDays: freshConfiguration?.thresholdDays ?? null,
      lastBorrowerInteractionAt: fresh.case.lastBorrowerInteractionAt,
      firstSuccessfulFollowUpAt: fresh.case.firstSuccessfulFollowUpAt,
      voiceSubmissionUnresolved: fresh.case.voiceSubmissionUnresolved
    });
    if (freshDecision.channel !== "voice" || !freshConfiguration?.provider || !freshConfiguration.outboundNumberId || !freshConfiguration.agentId) {
      return this.dispatchSms(fresh, leaseId, freshMissing, freshRecipient);
    }
    const pathSelected = await this.repository.selectDispatchPath(
      fresh.id,
      leaseId,
      "voice",
      freshConfiguration.provider
    );
    if (!pathSelected) return { outcome: "not_claimed" };
    const interaction = await this.voice.interactions.getOrCreate({
      businessId: fresh.businessId,
      caseId: fresh.caseId,
      caseFollowUpId: fresh.id,
      provider: freshConfiguration.provider,
      idempotencyKey: `voice-case-follow-up-${fresh.id}`,
      outboundNumberId: freshConfiguration.outboundNumberId,
      agentId: freshConfiguration.agentId
    });
    if (!interaction) {
      return this.fail(fresh.id, leaseId, "VOICE_TENANT_MISMATCH", "Voice interaction ownership validation failed");
    }
    if (interaction.status !== "PENDING") {
      return this.fail(fresh.id, leaseId, "VOICE_ALREADY_SUBMITTED", "Voice interaction is not safe to submit again");
    }
    const submitting = await this.voice.interactions.markSubmitting(interaction.id, followUp.businessId);
    if (!submitting) return this.fail(followUp.id, leaseId, "VOICE_STATE_CONFLICT", "Voice interaction could not be claimed");
    const dispatchStarted = await this.repository.markDispatchStarted(followUp.id, leaseId, this.now());
    if (!dispatchStarted) {
      await this.voice.interactions.markFailed(interaction.id, followUp.businessId, "LEASE_LOST_PRE_DISPATCH");
      return { outcome: "not_claimed" };
    }
    let result;
    try {
      result = await this.voice.provider.startCall({
        businessId: followUp.businessId,
        caseId: followUp.caseId,
        caseFollowUpId: followUp.id,
        idempotencyKey: interaction.idempotencyKey,
        recipient: freshRecipient,
        outboundNumberId: freshConfiguration.outboundNumberId,
        agentId: freshConfiguration.agentId,
        context
      });
    } catch (error) {
      if (error instanceof VoiceProviderOutcomeUnknownError) {
        await this.voice.interactions.markUnknown(interaction.id, followUp.businessId, "PROVIDER_RESULT_UNKNOWN");
        return this.fail(
          followUp.id,
          leaseId,
          "PROVIDER_RESULT_UNKNOWN",
          "Voice submission outcome is unknown and will not be retried automatically"
        );
      }
      const code = error instanceof VoiceProviderRejectedError ? error.code : "VOICE_SEND_FAILED";
      await this.voice.interactions.markFailed(interaction.id, followUp.businessId, code);
      return this.fail(followUp.id, leaseId, code, "Voice call could not be started");
    }
    try {
      const voiceAccepted = await this.voice.interactions.markAcceptedWithFollowUp({
        id: interaction.id,
        businessId: followUp.businessId,
        caseFollowUpId: followUp.id,
        leaseId,
        providerInteractionId: result.providerInteractionId,
        providerStatus: result.status,
        acceptedAt: this.now()
      });
      if (!voiceAccepted) return { outcome: "failed", code: "VOICE_PERSISTENCE_CONFLICT" };
      return { outcome: "accepted", providerMessageId: result.providerInteractionId };
    } catch {
      // Provider acceptance may already have happened. Leave both rows at the
      // dispatch boundary so lease recovery quarantines them as UNKNOWN.
      return { outcome: "failed", code: "VOICE_PERSISTENCE_CONFLICT" };
    }
  }

  private async dispatchSms(
    followUp: CaseFollowUpWorkItem,
    leaseId: string,
    missing: ReturnType<CaseMissingRequirementResolver["resolve"]>,
    recipient: string
  ): Promise<CaseFollowUpProcessResult> {
    const pathSelected = await this.repository.selectDispatchPath(followUp.id, leaseId, "sms", MessageProvider.Twilio);
    if (!pathSelected) return { outcome: "not_claimed" };
    const smsSettings = await this.channelRepository.GetSmsProviderConfiguration(followUp.businessId);
    const messagingServiceSid = smsSettings.messagingServiceSid?.trim();
    if (!smsSettings.enabled || !messagingServiceSid) {
      return this.fail(followUp.id, leaseId, "SMS_NOT_CONFIGURED", "Business SMS is disabled or its Messaging Service is unconfigured");
    }
    const portalAccess = await this.portalAccessService.getOrCreateActiveAccess(followUp.businessId, followUp.caseId);
    if (!portalAccess?.portalUrl) return this.fail(followUp.id, leaseId, "PORTAL_URL_UNAVAILABLE", "Client Portal URL is unavailable");
    const intakeEmailAddress = await this.inboundEmailService.getOrCreateAddress(followUp.businessId, followUp.caseId);
    if (!intakeEmailAddress) return this.fail(followUp.id, leaseId, "INBOUND_EMAIL_UNAVAILABLE", "Case inbound email address is unavailable");
    const outboundMessage: OutboundMessage = {
      channel: CommunicationChannel.Sms,
      provider: MessageProvider.Twilio,
      messagingServiceSid,
      to: recipient,
      body: this.messageBuilder.build({
        clientName: followUp.case.clientName,
        businessName: followUp.case.businessName,
        portalUrl: portalAccess.portalUrl,
        intakeEmailAddress,
        missingRequirements: missing
      }),
      businessId: followUp.businessId,
      clientId: followUp.case.clientId ?? undefined
    };
    const dispatchStarted = await this.repository.markDispatchStarted(followUp.id, leaseId, this.now());
    if (!dispatchStarted) return { outcome: "not_claimed" };
    const sendResult = await this.smsSender.sendMessage(outboundMessage);
    if (!sendResult.providerMessageId) {
      return this.fail(followUp.id, leaseId, "PROVIDER_RESULT_UNKNOWN", "Provider acceptance could not be confirmed");
    }
    const persisted = await this.repository.markAccepted(
      followUp.id,
      leaseId,
      sendResult.providerMessageId,
      sendResult.sentAt || this.now()
    );
    if (!persisted) return { outcome: "failed", code: "PERSISTENCE_CONFLICT" };
    return { outcome: "accepted", providerMessageId: sendResult.providerMessageId };
  }

  private async fail(id: number, leaseId: string, code: string, reason: string): Promise<CaseFollowUpProcessResult> {
    await this.repository.markFailed(id, leaseId, code, reason);
    this.workerLogger.warn("case_follow_up.not_sent", { caseFollowUpId: id, failureCode: code });
    return { outcome: "failed", code };
  }

  private async defer(id: number, leaseId: string, scheduledFor: Date): Promise<CaseFollowUpProcessResult> {
    await this.repository.defer(id, leaseId, scheduledFor);
    this.workerLogger.info("case_follow_up.deferred", {
      caseFollowUpId: id,
      reasonCode: "POLICY_HOUR_NOT_REACHED"
    });
    return { outcome: "deferred", code: "POLICY_HOUR_NOT_REACHED" };
  }

  private async skip(id: number, leaseId: string, code: string, reason: string): Promise<CaseFollowUpProcessResult> {
    await this.repository.markSkipped(id, leaseId, code, reason);
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
