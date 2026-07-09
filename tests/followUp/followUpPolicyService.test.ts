import { describe, expect, it } from "vitest";
import { FollowUpPolicyService } from "../../src/FollowUp/FollowUpPolicyService";
import { BusinessDto, CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";
import { ConversationState } from "../../src/dataClients/Types/stateMachineTypes";
import { FakeSqlManager } from "../fakes/FakeSqlManager";

const businessId = 1;
const clientPhone = "+15550000001";

function createBusiness(): BusinessDto {
  return {
    name: "Test Business",
    phone: "+15559999999",
    email: "owner@test-business.com",
    parameters: [
      { paramName: "name" },
      { paramName: "service" }
    ],
    starterMessage: "Welcome to Test Business. How can I help?",
    endMessage: "Thanks, we have everything we need.",
    escalationMessage: "I am escalating this to a human."
  };
}

function createConversationState(options: {
  conversationId?: number;
  lastUserMessageAt?: Date | null;
  lastBotMessageAt?: Date | null;
  followUpCount?: number;
  nextFollowUpAt?: Date | null;
} = {}): ConversationCacheState {
  const state = {
    conversationId: options.conversationId || 1,
    state: ConversationState.collecting,
    channel: CommunicationChannel.Whatsapp,
    provider: MessageProvider.Twilio,
    collectedParams: {
      name: null,
      service: null
    },
    lastMessages: [],
    updatedAt: new Date("2026-07-09T08:00:00.000Z"),
    phone: clientPhone
  } as ConversationCacheState & {
    lastUserMessageAt?: Date | null;
    lastBotMessageAt?: Date | null;
    followUpCount?: number;
    nextFollowUpAt?: Date | null;
  };

  state.lastUserMessageAt = options.lastUserMessageAt ?? null;
  state.lastBotMessageAt = options.lastBotMessageAt ?? new Date("2026-07-09T08:00:00.000Z");
  state.followUpCount = options.followUpCount ?? 0;
  state.nextFollowUpAt = options.nextFollowUpAt ?? null;
  return state;
}

async function createSeededSql(state: ConversationCacheState): Promise<FakeSqlManager> {
  const sql = new FakeSqlManager();
  sql.seedBusiness(businessId, createBusiness());
  const client = await sql.getOrCreateClientByPhone(clientPhone);
  sql.seedConversation(client.id, businessId, state);
  await sql.followUpRepository.upsertBusinessFollowUpPolicy(businessId, {
    enabled: true,
    delayMinutes: 90,
    timezone: "Asia/Jerusalem",
    maxFollowUps: 2,
    messageTemplate: "Still interested?"
  });
  return sql;
}

describe("FollowUpPolicyService", () => {
  it("creates pending follow-ups from open conversation policy candidates", async () => {
    const sql = await createSeededSql(createConversationState({
      lastBotMessageAt: new Date("2026-07-09T08:00:00.000Z")
    }));
    const service = new FollowUpPolicyService(sql.followUpRepository);

    const result = await service.createFollowUpsFromPolicies({
      limit: 10,
      now: new Date("2026-07-09T09:45:00.000Z")
    });

    expect(result.checkedCount).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({
      businessId,
      conversationId: 1,
      status: "PENDING",
      scheduledFor: "2026-07-09T09:30:00.000Z",
      messageBody: "Still interested?"
    });
    expect(result.created[0].metadata).toMatchObject({
      createdBy: "policy",
      delayMinutes: 90,
      timezone: "Asia/Jerusalem",
      basedOnLastBotMessageAt: "2026-07-09T08:00:00.000Z"
    });
  });

  it("skips policy candidates when the configured delay has not elapsed", async () => {
    const sql = await createSeededSql(createConversationState({
      lastBotMessageAt: new Date("2026-07-09T08:00:00.000Z")
    }));
    const service = new FollowUpPolicyService(sql.followUpRepository);

    const result = await service.createFollowUpsFromPolicies({
      limit: 10,
      now: new Date("2026-07-09T09:00:00.000Z")
    });

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toEqual([
      {
        businessId,
        conversationId: 1,
        reason: "delay_not_elapsed"
      }
    ]);
    expect(await sql.followUpRepository.getConversationFollowUps(businessId, 1)).toHaveLength(0);
  });

  it("creates policy follow-ups even outside the business allowed hours", async () => {
    const sql = await createSeededSql(createConversationState({
      lastBotMessageAt: new Date("2026-07-09T04:00:00.000Z")
    }));
    await sql.followUpRepository.upsertBusinessFollowUpPolicy(businessId, {
      enabled: true,
      delayMinutes: 90,
      timezone: "Asia/Jerusalem",
      allowedStartHour: 9,
      allowedEndHour: 17,
      maxFollowUps: 2,
      messageTemplate: "Still interested?"
    });
    const service = new FollowUpPolicyService(sql.followUpRepository);

    const result = await service.createFollowUpsFromPolicies({
      limit: 10,
      now: new Date("2026-07-09T18:00:00.000Z")
    });

    expect(result.skipped).toEqual([]);
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({
      businessId,
      conversationId: 1,
      status: "PENDING",
      scheduledFor: "2026-07-09T05:30:00.000Z"
    });
  });

  it("creates a pending follow-up from the business policy", async () => {
    const sql = await createSeededSql(createConversationState());
    const service = new FollowUpPolicyService(sql.followUpRepository);

    const result = await service.createFollowUpByPolicy({
      businessId,
      conversationId: 1,
      now: new Date("2026-07-09T08:10:00.000Z")
    });

    expect(result.created).toBe(true);
    if (!result.created) {
      throw new Error(`Expected follow-up to be created, got ${result.reason}`);
    }
    expect(result.followUp).toMatchObject({
      businessId,
      conversationId: 1,
      status: "PENDING",
      scheduledFor: "2026-07-09T09:30:00.000Z",
      messageBody: "Still interested?"
    });
    expect(result.followUp.metadata).toMatchObject({
      createdBy: "policy",
      delayMinutes: 90,
      basedOnLastBotMessageAt: "2026-07-09T08:00:00.000Z"
    });
  });

  it("uses conversation nextFollowUpAt when it is already set", async () => {
    const sql = await createSeededSql(createConversationState({
      nextFollowUpAt: new Date("2026-07-09T12:00:00.000Z")
    }));
    const service = new FollowUpPolicyService(sql.followUpRepository);

    const result = await service.createFollowUpByPolicy({
      businessId,
      conversationId: 1
    });

    expect(result.created).toBe(true);
    if (!result.created) {
      throw new Error(`Expected follow-up to be created, got ${result.reason}`);
    }
    expect(result.followUp.scheduledFor).toBe("2026-07-09T12:00:00.000Z");
  });

  it("does not create a follow-up when the user replied after the last bot message", async () => {
    const sql = await createSeededSql(createConversationState({
      lastUserMessageAt: new Date("2026-07-09T08:05:00.000Z"),
      lastBotMessageAt: new Date("2026-07-09T08:00:00.000Z")
    }));
    const service = new FollowUpPolicyService(sql.followUpRepository);

    const result = await service.createFollowUpByPolicy({
      businessId,
      conversationId: 1
    });

    expect(result).toEqual({
      created: false,
      reason: "user_replied_after_bot"
    });
    expect(await sql.followUpRepository.getConversationFollowUps(businessId, 1)).toHaveLength(0);
  });

  it("does not create a duplicate when a follow-up is already open", async () => {
    const sql = await createSeededSql(createConversationState());
    await sql.followUpRepository.createConversationFollowUp(businessId, {
      conversationId: 1,
      scheduledFor: "2026-07-09T09:00:00.000Z"
    });
    const service = new FollowUpPolicyService(sql.followUpRepository);

    const result = await service.createFollowUpByPolicy({
      businessId,
      conversationId: 1
    });

    expect(result).toEqual({
      created: false,
      reason: "follow_up_already_pending"
    });
    expect(await sql.followUpRepository.getConversationFollowUps(businessId, 1)).toHaveLength(1);
  });
});
