import { describe, expect, it, vi } from "vitest";
import { VoiceInteractionRepository } from "../../src/Voice/State/VoiceInteractionRepository";

describe("VoiceInteractionRepository", () => {
  const input = {
    businessId: 7,
    caseId: 20,
    caseFollowUpId: 55,
    provider: "elevenlabs",
    idempotencyKey: "voice-case-follow-up-55",
    outboundNumberId: "business-7-number",
    agentId: "business-7-agent"
  };

  it("creates state only after validating the complete tenant ownership chain", async () => {
    const prisma = {
      caseFollowUp: { findFirst: vi.fn().mockResolvedValue({ id: 55 }) },
      voiceInteraction: { upsert: vi.fn().mockResolvedValue({ id: 1, ...input, status: "PENDING" }) }
    };
    const repository = new VoiceInteractionRepository(prisma as any);

    await repository.getOrCreate(input);
    expect(prisma.caseFollowUp.findFirst).toHaveBeenCalledWith({
      where: {
        id: 55,
        businessId: 7,
        caseId: 20,
        case: { businessId: 7 }
      },
      select: { id: true }
    });
    expect(prisma.voiceInteraction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { caseFollowUpId: 55 },
      create: input
    }));
  });

  it("rejects mismatched tenant/case ownership before creating voice state", async () => {
    const prisma = {
      caseFollowUp: { findFirst: vi.fn().mockResolvedValue(null) },
      voiceInteraction: { upsert: vi.fn() }
    };
    const repository = new VoiceInteractionRepository(prisma as any);

    await expect(repository.getOrCreate(input)).resolves.toBeNull();
    expect(prisma.voiceInteraction.upsert).not.toHaveBeenCalled();
  });

  it("persists opaque provider correlation under the owning business", async () => {
    const prisma = { voiceInteraction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const repository = new VoiceInteractionRepository(prisma as any);

    await expect(repository.markAccepted({
      id: 1,
      businessId: 7,
      providerInteractionId: "opaque-provider-id",
      providerStatus: "provider-accepted"
    })).resolves.toBe(true);
    expect(prisma.voiceInteraction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1, businessId: 7, status: "SUBMITTING" },
      data: expect.objectContaining({ providerInteractionId: "opaque-provider-id" })
    }));
  });

  it("records an ambiguous submission without making it eligible for another submit", async () => {
    const prisma = { voiceInteraction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
    const repository = new VoiceInteractionRepository(prisma as any);

    await expect(repository.markUnknown(1, 7, "PROVIDER_RESULT_UNKNOWN")).resolves.toBe(true);
    expect(prisma.voiceInteraction.updateMany).toHaveBeenCalledWith({
      where: { id: 1, businessId: 7, status: "SUBMITTING" },
      data: { status: "UNKNOWN", failureCode: "PROVIDER_RESULT_UNKNOWN" }
    });
  });

  it("resolves an opaque provider ID to stored Voxis tenant and aggregate IDs", async () => {
    const prisma = {
      voiceInteraction: {
        findUnique: vi.fn().mockResolvedValue({ id: 1, businessId: 7, caseId: 20, caseFollowUpId: 55 })
      }
    };
    const repository = new VoiceInteractionRepository(prisma as any);

    await expect(repository.resolveProviderCorrelation("elevenlabs", "opaque-provider-id"))
      .resolves.toEqual({ voiceInteractionId: 1, businessId: 7, caseId: 20, caseFollowUpId: 55 });
    expect(prisma.voiceInteraction.findUnique).toHaveBeenCalledWith({
      where: {
        provider_providerInteractionId: {
          provider: "elevenlabs",
          providerInteractionId: "opaque-provider-id"
        }
      },
      select: { id: true, businessId: true, caseId: true, caseFollowUpId: true }
    });
  });
});
