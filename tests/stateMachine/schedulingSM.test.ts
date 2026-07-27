import { describe, expect, it } from "vitest";
import { ConversationStateMachine, MAX_SCHEDULING_ATTEMPTS } from "../../src/MessageService/context/conversationSM";
import { CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";
import { BotMsg as Action, ConversationEvent, ConversationState, StateMachineOutput } from "../../src/dataClients/Types/stateMachineTypes";

function createCache(
  state: ConversationState,
  collectedParams: Record<string, string | number | null> = { name: "David", service: "consulting" },
  schedulingAttempts?: number
): ConversationCacheState {
  return {
    conversationId: 42,
    state,
    channel: CommunicationChannel.Whatsapp,
    provider: MessageProvider.Twilio,
    collectedParams,
    lastMessages: [],
    updatedAt: new Date("2026-07-26T00:00:00.000Z"),
    phone: "+10000000000",
    schedulingAttempts
  };
}

function llmOutput(
  conversationEvent: ConversationEvent,
  extras: Partial<StateMachineOutput> = {}
): StateMachineOutput {
  return {
    conversationEvent,
    newConclusion: `Fake LLM event: ${conversationEvent}`,
    ...extras
  };
}

describe("ConversationStateMachine scheduling", () => {
  it("proposes scheduling instead of closing when params complete and scheduling is enabled", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.collecting, { name: "David", service: null });

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams, { params: { service: "consulting" } }),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.proposeSchedule]);
    expect(cache.state).toBe(ConversationState.scheduling);
    expect(cache.schedulingAttempts).toBe(1);
  });

  it("keeps the legacy closing flow when scheduling is disabled", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.collecting, { name: "David", service: null });

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams, { params: { service: "consulting" } }),
      cache
    );

    expect(actions).toEqual([Action.tryClosing]);
    expect(cache.state).toBe(ConversationState.closing);
  });

  it("confirms and stores the time when the user agrees with a concrete slot", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.scheduling, undefined, 1);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.schedulingAgreed, { scheduledTime: "2026-07-28T15:00:00.000Z" }),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.confirmSchedule]);
    expect(cache.state).toBe(ConversationState.closing);
    expect(cache.scheduledFor).toBe("2026-07-28T15:00:00.000Z");
  });

  it("keeps negotiating when the user agrees without a concrete time", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.scheduling, undefined, 1);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.schedulingAgreed),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.proposeSchedule]);
    expect(cache.state).toBe(ConversationState.scheduling);
    expect(cache.schedulingAttempts).toBe(2);
  });

  it("exits to closing immediately on decline", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.scheduling, undefined, 1);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.schedulingDeclined),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.tryClosing]);
    expect(cache.state).toBe(ConversationState.closing);
  });

  it("exits to closing on client concern without further scheduling pressure", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.scheduling, undefined, 1);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.concern),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.tryClosing]);
    expect(cache.state).toBe(ConversationState.closing);
  });

  it("gives up after the attempt cap and moves to closing", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.scheduling, undefined, MAX_SCHEDULING_ATTEMPTS);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.tryClosing]);
    expect(cache.state).toBe(ConversationState.closing);
  });

  it("still applies params provided mid-negotiation", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.scheduling, { name: null, service: "consulting" }, 1);

    machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams, { params: { name: "Ruth" } }),
      cache,
      { schedulingEnabled: true }
    );

    expect(cache.collectedParams.name).toBe("Ruth");
  });

  it("allows late agreement from closing", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.closing);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.schedulingAgreed, { scheduledTime: "2026-07-29T10:00:00.000Z" }),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.confirmSchedule]);
    expect(cache.state).toBe(ConversationState.closing);
    expect(cache.scheduledFor).toBe("2026-07-29T10:00:00.000Z");
  });

  it("ends from scheduling when the user wants to finish", () => {
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.scheduling, undefined, 1);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.tryEnding),
      cache,
      { schedulingEnabled: true }
    );

    expect(actions).toEqual([Action.endConversation]);
    expect(cache.state).toBe(ConversationState.ended);
  });
});
