import { describe, expect, it, vi } from "vitest";
import { CaseFollowUpMessageBuilder } from "../../src/CaseFollowUp/CaseFollowUpMessageBuilder";
import { CaseFollowUpWorker } from "../../src/CaseFollowUp/CaseFollowUpWorker";
import { CaseMissingRequirementResolver } from "../../src/CaseFollowUp/CaseMissingRequirementResolver";
import { CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import {
  CaseFollowUpWorkItem
} from "../../src/dataClients/SqlClient/Repositories/CaseFollowUpRepo/ICaseFollowUpRepository";
import { ILogger, LogData } from "../../src/logging/logger";
import { TwilioProviderRejectedError, TwilioSendOutcomeUnknownError } from "../../src/MessageSender/twilioMessageSender";
import { FakeVoiceCallProvider } from "../../src/Voice/Providers/FakeVoiceCallProvider";
import {
  VoiceProviderOutcomeUnknownError,
  VoiceProviderRejectedError
} from "../../src/Voice/Providers/VoiceCallProvider";

class CaptureLogger implements ILogger {
  entries: Array<{ message: string; data?: LogData }> = [];
  debug(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  info(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  warn(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  error(message: string, data?: LogData): void { this.entries.push({ message, data }); }
  child(): ILogger { return this; }
}

function workItem(overrides: {
  businessId?: number;
  caseBusinessId?: number;
  status?: CaseFollowUpWorkItem["case"]["status"];
  archivedAt?: Date | null;
  clientPhoneNumber?: string | null;
  leadPhoneNumber?: string | null;
  documentStatus?: "EXTRACTED" | "FAILED";
  policyEnabled?: boolean;
  policyHour?: number | null;
  policyTimezone?: string;
  cadenceKey?: string;
  lastBorrowerInteractionAt?: Date | null;
  firstSuccessfulFollowUpAt?: Date | null;
} = {}): CaseFollowUpWorkItem {
  return {
    id: 55,
    businessId: overrides.businessId ?? 7,
    caseId: 20,
    status: "PROCESSING",
    cadenceKey: overrides.cadenceKey ?? "case-document:2026-08-23",
    case: {
      businessId: overrides.caseBusinessId ?? 7,
      status: overrides.status ?? "IN_PROGRESS",
      archivedAt: overrides.archivedAt ?? null,
      lastBorrowerInteractionAt: overrides.lastBorrowerInteractionAt ?? null,
      firstSuccessfulFollowUpAt: overrides.firstSuccessfulFollowUpAt ?? null,
      voiceSubmissionUnresolved: false,
      businessName: "Voxis Finance",
      clientId: 9,
      clientName: "Dana",
      clientPhoneNumber: overrides.clientPhoneNumber === undefined
        ? "+972501234567"
        : overrides.clientPhoneNumber,
      leadPhoneNumber: overrides.leadPhoneNumber ?? "+972509999999",
      policy: {
        enabled: overrides.policyEnabled ?? true,
        timezone: overrides.policyTimezone ?? "UTC",
        hour: overrides.policyHour === undefined ? 9 : overrides.policyHour
      },
      requirements: [{
        id: 30,
        label: "Payslip — May",
        required: true,
        schemaName: "Payslip",
        documentTypeName: "Payslip",
        documents: overrides.documentStatus ? [{
          status: overrides.documentStatus,
          createdAt: new Date("2026-08-23T09:00:00.000Z")
        }] : []
      }]
    }
  };
}

function voiceCollaborators(
  item: CaseFollowUpWorkItem,
  configurationOverrides: Record<string, unknown> = {},
  provider: any = new FakeVoiceCallProvider()
) {
  const deps = collaborators(item);
  const configuration = {
    get: vi.fn().mockResolvedValue({
      enabled: true,
      thresholdDays: 1,
      providerEnabled: true,
      providerConfigured: true,
      provider: provider.provider,
      outboundNumberId: "business-7-number",
      agentId: "business-7-agent",
      ...configurationOverrides
    })
  };
  const interactions = {
    getOrCreate: vi.fn().mockResolvedValue({
      id: 90,
      businessId: 7,
      caseId: 20,
      caseFollowUpId: 55,
      provider: provider.provider,
      providerInteractionId: null,
      idempotencyKey: "voice-case-follow-up-55",
      status: "PENDING"
    }),
    markSubmitting: vi.fn().mockResolvedValue(true),
    markAccepted: vi.fn().mockResolvedValue(true),
    markAcceptedWithFollowUp: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    markUnknown: vi.fn().mockResolvedValue(true)
  };
  const contextBuilder = {
    build: vi.fn().mockResolvedValue({
      caseId: 20,
      businessName: "Voxis Finance",
      borrowerName: "Dana",
      missingDocuments: [{ label: "Payslip — May" }],
      receivedDocuments: [],
      uploadUrl: "https://portal.example/c/token"
    })
  };
  const worker = new CaseFollowUpWorker(
    deps.repository as any,
    deps.channelRepository as any,
    deps.portalAccess as any,
    deps.inboundEmail as any,
    deps.sender,
    new CaseMissingRequirementResolver(),
    new CaseFollowUpMessageBuilder(),
    deps.logger,
    () => new Date("2026-08-23T10:00:00.000Z"),
    { configuration, interactions: interactions as any, contextBuilder, provider }
  );
  return { ...deps, worker, configuration, interactions, contextBuilder, provider };
}

function collaborators(item: CaseFollowUpWorkItem = workItem()) {
  const repository = {
    claimPending: vi.fn().mockResolvedValue(item),
    reloadClaimed: vi.fn().mockResolvedValue(item),
    markDispatchStarted: vi.fn().mockResolvedValue(true),
    selectDispatchPath: vi.fn().mockResolvedValue(true),
    markAccepted: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    defer: vi.fn().mockResolvedValue(true),
    markSkipped: vi.fn().mockResolvedValue(true)
  };
  const channelRepository = {
    GetSmsProviderConfiguration: vi.fn().mockResolvedValue({
      enabled: true,
      senderId: "VOXIS",
      messagingServiceConfigured: true,
      messagingServiceSid: "MG123",
      alphaSenderSid: "AI123"
    })
  };
  const portalAccess = {
    getOrCreateActiveAccess: vi.fn().mockResolvedValue({
      accessToken: "raw-secret-token",
      expiresAt: new Date("2026-08-30T00:00:00.000Z"),
      portalUrl: "https://portal.example/c/raw-secret-token"
    })
  };
  const inboundEmail = {
    getOrCreateAddress: vi.fn().mockResolvedValue("case-abc123@docs.example.com")
  };
  const sender = {
    sendMessage: vi.fn().mockResolvedValue({
      providerMessageId: "SM123",
      sentAt: new Date("2026-08-23T10:00:01.000Z")
    })
  };
  const logger = new CaptureLogger();
  const worker = new CaseFollowUpWorker(
    repository as any,
    channelRepository as any,
    portalAccess as any,
    inboundEmail as any,
    sender,
    new CaseMissingRequirementResolver(),
    new CaseFollowUpMessageBuilder(),
    logger,
    () => new Date("2026-08-23T10:00:00.000Z")
  );
  return { repository, channelRepository, portalAccess, inboundEmail, sender, logger, worker };
}

describe("CaseFollowUpWorker", () => {
  it("claims by CaseFollowUp ID, reloads trusted state, sends SMS, and persists acceptance", async () => {
    const { repository, channelRepository, portalAccess, inboundEmail, sender, logger, worker } = collaborators();

    await expect(worker.process(55)).resolves.toEqual({
      outcome: "accepted",
      providerMessageId: "SM123"
    });
    expect(repository.claimPending).toHaveBeenCalledWith(
      55,
      expect.any(String),
      new Date("2026-08-23T10:05:00.000Z")
    );
    expect(channelRepository.GetSmsProviderConfiguration).toHaveBeenCalledWith(7);
    expect(portalAccess.getOrCreateActiveAccess).toHaveBeenCalledWith(7, 20);
    expect(inboundEmail.getOrCreateAddress).toHaveBeenCalledWith(7, 20);
    const outbound = sender.sendMessage.mock.calls[0][0];
    expect(outbound).toMatchObject({
      businessId: 7,
      clientId: 9,
      messagingServiceSid: "MG123",
      to: "+972501234567",
      channel: CommunicationChannel.Sms,
      provider: MessageProvider.Twilio
    });
    expect(outbound).not.toHaveProperty("conversationId");
    expect(outbound.body).toContain("Payslip — May");
    expect(outbound.body).toContain("https://portal.example/c/raw-secret-token");
    expect(outbound.body).toContain("case-abc123@docs.example.com");
    expect(sender.sendMessage).toHaveBeenCalledWith(outbound);
    expect(repository.markDispatchStarted).toHaveBeenCalledWith(
      55,
      expect.any(String),
      new Date("2026-08-23T10:00:00.000Z")
    );
    expect(repository.markAccepted).toHaveBeenCalledWith(
      55,
      expect.any(String),
      "SM123",
      new Date("2026-08-23T10:00:01.000Z")
    );

    const logs = JSON.stringify(logger.entries);
    expect(logs).not.toContain("+972501234567");
    expect(logs).not.toContain("raw-secret-token");
    expect(logs).not.toContain("case-abc123@docs.example.com");
    expect(logs).not.toContain("Payslip — May");
    expect(logs).not.toContain("עדיין חסרים");
  });

  it("does not process a row that was not atomically claimed from PENDING", async () => {
    const deps = collaborators();
    deps.repository.claimPending.mockResolvedValue(null);
    await expect(deps.worker.process(55)).resolves.toEqual({ outcome: "not_claimed" });
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("re-evaluates requirements and skips a newly satisfied Case", async () => {
    const deps = collaborators(workItem({ documentStatus: "EXTRACTED" }));
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "skipped",
      code: "NO_MISSING_REQUIREMENTS"
    });
    expect(deps.repository.markSkipped).toHaveBeenCalledWith(
      55,
      expect.any(String),
      "NO_MISSING_REQUIREMENTS",
      expect.any(String)
    );
    expect(deps.portalAccess.getOrCreateActiveAccess).not.toHaveBeenCalled();
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("skips a Case that became completed before send", async () => {
    const deps = collaborators(workItem({ status: "COMPLETED" }));
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "skipped",
      code: "CASE_INACTIVE"
    });
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("rejects a cross-business mismatch before resolving sender or recipient", async () => {
    const deps = collaborators(workItem({ caseBusinessId: 8 }));
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "failed",
      code: "TENANT_MISMATCH"
    });
    expect(deps.repository.markFailed).toHaveBeenCalledWith(
      55,
      expect.any(String),
      "TENANT_MISMATCH",
      expect.any(String)
    );
    expect(deps.channelRepository.GetSmsProviderConfiguration).not.toHaveBeenCalled();
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("uses the existing Lead phone fallback only when the canonical Client phone is unusable", async () => {
    const deps = collaborators(workItem({ clientPhoneNumber: null }));
    await deps.worker.process(55);
    expect(deps.sender.sendMessage.mock.calls[0][0].to).toBe("+972509999999");
  });

  it("fails safely when Business SMS configuration is unavailable", async () => {
    const deps = collaborators();
    deps.channelRepository.GetSmsProviderConfiguration.mockResolvedValue({ enabled: false, senderId: null, messagingServiceConfigured: false, messagingServiceSid: null, alphaSenderSid: null });
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "failed",
      code: "SMS_NOT_CONFIGURED"
    });
    expect(deps.portalAccess.getOrCreateActiveAccess).not.toHaveBeenCalled();
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("fails safely when the Case inbound email address is unavailable", async () => {
    const deps = collaborators();
    deps.inboundEmail.getOrCreateAddress.mockResolvedValue(null);
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "failed",
      code: "INBOUND_EMAIL_UNAVAILABLE"
    });
    expect(deps.repository.markFailed).toHaveBeenCalledWith(
      55,
      expect.any(String),
      "INBOUND_EMAIL_UNAVAILABLE",
      expect.any(String)
    );
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("persists a sanitized FAILED result for a known provider rejection", async () => {
    const deps = collaborators();
    deps.sender.sendMessage.mockRejectedValue(new TwilioProviderRejectedError(400, "21606"));
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "failed",
      code: "TWILIO_REJECTED_21606"
    });
    expect(deps.repository.markFailed).toHaveBeenCalledWith(
      55,
      expect.any(String),
      "TWILIO_REJECTED_21606",
      "Twilio rejected the SMS request"
    );
    const logs = JSON.stringify(deps.logger.entries);
    expect(logs).not.toContain("auth-secret");
    expect(logs).not.toContain("AC-secret");
  });
  it("records an ambiguous post-submit outcome and does not request an automatic retry", async () => {
    const deps = collaborators();
    deps.sender.sendMessage.mockRejectedValue(new TwilioSendOutcomeUnknownError());
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "failed",
      code: "PROVIDER_RESULT_UNKNOWN"
    });
    expect(deps.sender.sendMessage).toHaveBeenCalledTimes(1);
    expect(deps.repository.markFailed).toHaveBeenCalledWith(
      55,
      expect.any(String),
      "PROVIDER_RESULT_UNKNOWN",
      "SMS submission outcome is unknown and will not be retried automatically"
    );
  });

  it("skips before resolving SMS when the Case-document policy was disabled", async () => {
    const deps = collaborators(workItem({ policyEnabled: false }));
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "skipped",
      code: "POLICY_DISABLED"
    });
    expect(deps.channelRepository.GetSmsProviderConfiguration).not.toHaveBeenCalled();
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("defers safely when the configured local hour was moved later", async () => {
    const deps = collaborators(workItem({ policyHour: 12 }));
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "deferred",
      code: "POLICY_HOUR_NOT_REACHED"
    });
    expect(deps.repository.defer).toHaveBeenCalledWith(
      55,
      expect.any(String),
      new Date("2026-08-23T12:00:00.000Z")
    );
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("skips a stale row when a timezone change moves it to another local date", async () => {
    const deps = collaborators(workItem({
      policyTimezone: "Asia/Jerusalem",
      policyHour: 1,
      cadenceKey: "case-document:2026-08-22"
    }));
    await expect(deps.worker.process(55)).resolves.toEqual({
      outcome: "skipped",
      code: "POLICY_SCHEDULE_CHANGED"
    });
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("does not contact the provider when lease ownership is lost before dispatch", async () => {
    const deps = collaborators();
    deps.repository.markDispatchStarted.mockResolvedValue(false);

    await expect(deps.worker.process(55)).resolves.toEqual({ outcome: "not_claimed" });
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
  });

  it("keeps SMS below the voice escalation threshold", async () => {
    const deps = voiceCollaborators(workItem({
      firstSuccessfulFollowUpAt: new Date("2026-08-23T09:00:00.000Z")
    }));
    await deps.worker.process(55);
    expect(deps.sender.sendMessage).toHaveBeenCalledTimes(1);
    expect(deps.provider.calls).toHaveLength(0);
    expect(deps.repository.selectDispatchPath).toHaveBeenCalledWith(55, expect.any(String), "sms", "twilio");
  });

  it("selects VOICE at X=1 and persists the complete internal lifecycle", async () => {
    const deps = voiceCollaborators(workItem({
      firstSuccessfulFollowUpAt: new Date("2026-08-22T10:00:00.000Z")
    }));

    const result = await deps.worker.process(55);
    expect(result).toEqual({ outcome: "accepted", providerMessageId: expect.stringMatching(/^fake-/) });
    expect(deps.sender.sendMessage).not.toHaveBeenCalled();
    expect(deps.interactions.getOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 7,
      caseId: 20,
      caseFollowUpId: 55,
      idempotencyKey: "voice-case-follow-up-55"
    }));
    expect(deps.contextBuilder.build).toHaveBeenCalledWith({ businessId: 7, caseId: 20 });
    expect(deps.provider.calls).toHaveLength(1);
    expect(deps.interactions.markAcceptedWithFollowUp).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 7,
      providerInteractionId: expect.stringMatching(/^fake-/)
    }));
    expect(deps.repository.selectDispatchPath).toHaveBeenCalledWith(55, expect.any(String), "voice", "fake");
  });

  it("uses a newer borrower interaction to reset voice escalation", async () => {
    const deps = voiceCollaborators(workItem({
      firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z"),
      lastBorrowerInteractionAt: new Date("2026-08-23T09:00:00.000Z")
    }));
    await deps.worker.process(55);
    expect(deps.sender.sendMessage).toHaveBeenCalledTimes(1);
    expect(deps.provider.calls).toHaveLength(0);
  });

  it("falls back to SMS when voice is disabled", async () => {
    const deps = voiceCollaborators(
      workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") }),
      { enabled: false }
    );
    await deps.worker.process(55);
    expect(deps.sender.sendMessage).toHaveBeenCalledTimes(1);
    expect(deps.provider.calls).toHaveLength(0);
  });

  it("falls back safely to SMS when voice provider configuration is incomplete", async () => {
    const deps = voiceCollaborators(
      workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") }),
      { providerConfigured: false, outboundNumberId: null }
    );
    await deps.worker.process(55);
    expect(deps.sender.sendMessage).toHaveBeenCalledTimes(1);
    expect(deps.provider.calls).toHaveLength(0);
  });

  it("does not create a duplicate interaction or call when duplicate worker execution loses the claim", async () => {
    const deps = voiceCollaborators(workItem({
      firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z")
    }));
    deps.repository.claimPending
      .mockResolvedValueOnce(workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") }))
      .mockResolvedValueOnce(null);
    await deps.worker.process(55);
    await expect(deps.worker.process(55)).resolves.toEqual({ outcome: "not_claimed" });
    expect(deps.interactions.getOrCreate).toHaveBeenCalledTimes(1);
    expect(deps.provider.calls).toHaveLength(1);
  });

  it("records a definite voice provider failure", async () => {
    const provider = {
      provider: "fake",
      startCall: vi.fn().mockRejectedValue(new VoiceProviderRejectedError("VOICE_REJECTED"))
    };
    const deps = voiceCollaborators(
      workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") }),
      {},
      provider
    );
    await expect(deps.worker.process(55)).resolves.toEqual({ outcome: "failed", code: "VOICE_REJECTED" });
    expect(deps.interactions.markFailed).toHaveBeenCalledWith(90, 7, "VOICE_REJECTED");
  });

  it("marks an ambiguous voice result UNKNOWN and never submits it again", async () => {
    const provider = {
      provider: "fake",
      startCall: vi.fn().mockRejectedValue(new VoiceProviderOutcomeUnknownError())
    };
    const deps = voiceCollaborators(
      workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") }),
      {},
      provider
    );
    await expect(deps.worker.process(55)).resolves.toEqual({ outcome: "failed", code: "PROVIDER_RESULT_UNKNOWN" });
    expect(provider.startCall).toHaveBeenCalledTimes(1);
    expect(deps.interactions.markUnknown).toHaveBeenCalledWith(90, 7, "PROVIDER_RESULT_UNKNOWN");
  });

  it("revalidates newly received documents immediately before voice dispatch", async () => {
    const initial = workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") });
    const deps = voiceCollaborators(initial);
    deps.repository.reloadClaimed.mockResolvedValue(workItem({
      firstSuccessfulFollowUpAt: initial.case.firstSuccessfulFollowUpAt,
      documentStatus: "EXTRACTED"
    }));

    await expect(deps.worker.process(55)).resolves.toEqual({ outcome: "skipped", code: "NO_MISSING_REQUIREMENTS" });
    expect(deps.provider.calls).toHaveLength(0);
  });

  it("uses the current recipient from the final lease-scoped reload", async () => {
    const initial = workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") });
    const deps = voiceCollaborators(initial);
    deps.repository.reloadClaimed.mockResolvedValue(workItem({
      firstSuccessfulFollowUpAt: initial.case.firstSuccessfulFollowUpAt,
      clientPhoneNumber: "+972501111111"
    }));

    await deps.worker.process(55);
    expect(deps.provider.calls[0].recipient).toBe("+972501111111");
  });

  it("falls back to SMS when a fresh borrower interaction resets escalation before dispatch", async () => {
    const initial = workItem({ firstSuccessfulFollowUpAt: new Date("2026-08-20T10:00:00.000Z") });
    const deps = voiceCollaborators(initial);
    deps.repository.reloadClaimed.mockResolvedValue(workItem({
      firstSuccessfulFollowUpAt: initial.case.firstSuccessfulFollowUpAt,
      lastBorrowerInteractionAt: new Date("2026-08-23T09:59:00.000Z")
    }));

    await deps.worker.process(55);
    expect(deps.provider.calls).toHaveLength(0);
    expect(deps.sender.sendMessage).toHaveBeenCalledTimes(1);
  });

});
