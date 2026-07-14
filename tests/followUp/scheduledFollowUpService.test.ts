import { describe, expect, it } from "vitest";
import { ScheduledFollowUpService } from "../../src/FollowUp/ScheduledFollowUpService";
import { NullLogger } from "../../src/logging/logger";
import { ApiActionType, BusinessDto, CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";
import { ConversationState } from "../../src/dataClients/Types/stateMachineTypes";
import { FakeOutboundMessageQueue } from "../fakes/FakeOutboundMessageQueue";
import { FakeSqlManager } from "../fakes/FakeSqlManager";

const businessId = 1;

function createBusiness(): BusinessDto {
  return {
    name: "Test Business",
    phone: "whatsapp:+15559999999",
    email: "owner@test-business.com",
    parameters: [
      { paramName: "name" },
      { paramName: "service" }
    ],
    starterMessage: "Welcome to Test Business. How can I help?",
    endMessage: "Thanks, we have everything we need.",
    escalationMessage: "I am escalating this to a human.",
    language: "en"
  };
}

function createConversationState(options: {
  conversationId?: number;
  phone?: string;
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
    phone: options.phone || "+15550000001"
  } as ConversationCacheState & {
    lastUserMessageAt?: Date | null;
    lastBotMessageAt?: Date | null;
    lastFollowUpAt?: Date | null;
    followUpCount?: number;
    nextFollowUpAt?: Date | null;
  };

  state.lastUserMessageAt = options.lastUserMessageAt ?? null;
  state.lastBotMessageAt = options.lastBotMessageAt ?? new Date("2026-07-09T08:00:00.000Z");
  state.lastFollowUpAt = null;
  state.followUpCount = options.followUpCount ?? 0;
  state.nextFollowUpAt = options.nextFollowUpAt ?? null;
  return state;
}

async function createSeededSql(state: ConversationCacheState): Promise<FakeSqlManager> {
  const sql = new FakeSqlManager();
  sql.seedBusiness(businessId, createBusiness());
  const client = await sql.getOrCreateClientByPhone(state.phone);
  sql.seedConversation(client.id, businessId, state);
  await sql.followUpRepository.upsertBusinessFollowUpPolicy(businessId, {
    enabled: true,
    delayMinutes: 90,
    timezone: "Asia/Jerusalem",
    allowedStartHour: 9,
    allowedEndHour: 17,
    maxFollowUps: 2,
    messageTemplate: "Still interested?"
  });
  return sql;
}

describe("ScheduledFollowUpService", () => {
  it("creates due policy follow-ups and sends them in the same tick", async () => {
    const sql = await createSeededSql(createConversationState());
    const outboundQueue = new FakeOutboundMessageQueue();
    const service = new ScheduledFollowUpService(sql, outboundQueue, new NullLogger());

    await service.runOnce(new Date("2026-07-09T10:00:00.000Z"));

    expect(outboundQueue.events).toHaveLength(1);
    expect(outboundQueue.events[0].event).toMatchObject({
      type: ApiActionType.FollowUp,
      channel: CommunicationChannel.Whatsapp,
      provider: MessageProvider.Twilio,
      content: "Still interested?",
      businessId
    });
    expect(outboundQueue.events[0].event.data).toMatchObject({
      From: "whatsapp:+15559999999",
      To: "+15550000001",
      Body: "Still interested?",
      clientId: 1,
      conversationId: 1
    });

    const followUps = await sql.followUpRepository.getConversationFollowUps(businessId, 1);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      status: "SENT",
      sentAt: "2026-07-09T10:00:00.000Z",
      messageBody: "Still interested?"
    });

    const conversation = await sql.followUpRepository.getConversationFollowUpState(businessId, 1);
    expect(conversation).toMatchObject({
      followUpCount: 1,
      lastFollowUpAt: "2026-07-09T10:00:00.000Z",
      nextFollowUpAt: null
    });
  });

  it("sends pending due follow-ups that existed before the scheduler tick", async () => {
    const sql = await createSeededSql(createConversationState());
    await sql.followUpRepository.createConversationFollowUp(businessId, {
      conversationId: 1,
      scheduledFor: "2026-07-09T09:30:00.000Z",
      messageBody: "Existing follow-up"
    });
    const outboundQueue = new FakeOutboundMessageQueue();
    const service = new ScheduledFollowUpService(sql, outboundQueue, new NullLogger());

    await service.runOnce(new Date("2026-07-09T10:00:00.000Z"));

    expect(outboundQueue.events).toHaveLength(1);
    expect(outboundQueue.events[0].event.data.Body).toBe("Existing follow-up");

    const followUps = await sql.followUpRepository.getConversationFollowUps(businessId, 1);
    expect(followUps).toHaveLength(1);
    expect(followUps[0].status).toBe("SENT");
  });

  it("defers pending follow-ups outside allowed business hours without claiming them", async () => {
    const sql = await createSeededSql(createConversationState());
    const followUp = await sql.followUpRepository.createConversationFollowUp(businessId, {
      conversationId: 1,
      scheduledFor: "2026-07-09T09:30:00.000Z",
      messageBody: "Existing follow-up"
    });
    const outboundQueue = new FakeOutboundMessageQueue();
    const service = new ScheduledFollowUpService(sql, outboundQueue, new NullLogger());

    await service.runOnce(new Date("2026-07-09T18:00:00.000Z"));

    expect(outboundQueue.jobs).toHaveLength(0);

    const followUps = await sql.followUpRepository.getConversationFollowUps(businessId, 1);
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({
      id: followUp.id,
      status: "PENDING",
      sentAt: null
    });
  });
});
