import { describe, expect, it } from "vitest";
import { ConversationStateMachine } from "../../src/MessageService/context/conversationSM";
import { CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";
import { Action, ConversationEvent, ConversationState, StateMachineOutput } from "../../src/dataClients/Types/stateMachineTypes";

function createCache(
  state: ConversationState,
  collectedParams: Record<string, string | number | null> = {
    name: null,
    service: null,
    preferredDate: null
  }
): ConversationCacheState {
  return {
    conversationId: 1,
    state,
    channel: CommunicationChannel.Whatsapp,
    provider: MessageProvider.Twilio,
    collectedParams,
    lastMessages: [],
    updatedAt: new Date("2026-05-25T00:00:00.000Z"),
    phone: "+10000000000"
  };
}

function llmOutput(
  conversationEvent: ConversationEvent,
  params?: Record<string, string | number | null>
): StateMachineOutput {
  return {
    conversationEvent,
    newConclusion: `Fake LLM event: ${conversationEvent}`,
    params
  };
}

describe("ConversationStateMachine", () => {
  it("moves from start to collecting after sending the welcome message", () => {
    // First contact should send the business welcome once, then prepare to collect params.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.start);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.startConversation),
      cache
    );

    expect(actions).toEqual([Action.sendWelcomeMessage]);
    expect(cache.state).toBe(ConversationState.collecting);
  });

  it("asks for params when collecting and the LLM extracted nothing useful", () => {
    // No extracted params means the bot should keep collecting instead of closing.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.collecting);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams),
      cache
    );

    expect(actions).toEqual([Action.askForParams]);
    expect(cache.state).toBe(ConversationState.collecting);
  });

  it("applies a partial param immediately and still asks for the missing fields", () => {
    // This locks in the product rule: valid extracted params are saved immediately.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.collecting);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams, { name: "David" }),
      cache
    );

    expect(actions).toEqual([Action.applyParams, Action.askForParams]);
    expect(cache.state).toBe(ConversationState.collecting);
  });

  it("applies the final missing params and moves to closing", () => {
    // When the merged old + new params satisfy all required fields, the bot can close.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.collecting, {
      name: "David",
      service: null,
      preferredDate: null
    });

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams, {
        service: "window cleaning",
        preferredDate: "Monday"
      }),
      cache
    );

    expect(actions).toEqual([Action.applyParams, Action.tryClosing]);
    expect(cache.state).toBe(ConversationState.closing);
  });

  it("applies params from a concern without changing to a pacing state", () => {
    // Concern is now conversational posture only; business state still follows params.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.collecting);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.concern, { service: "pricing help" }),
      cache
    );

    expect(actions).toEqual([Action.applyParams, Action.askForParams]);
    expect(cache.state).toBe(ConversationState.collecting);
  });

  it("moves to closing from a concern when all params are present", () => {
    // The durable state follows parameter completeness, not the emotional event.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.collecting, {
      name: "David",
      service: null,
      preferredDate: null
    });

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.concern, {
        service: "consulting",
        preferredDate: "Tuesday"
      }),
      cache
    );

    expect(actions).toEqual([Action.applyParams, Action.tryClosing]);
    expect(cache.state).toBe(ConversationState.closing);
  });

  it("keeps closing open unless the LLM extraction explicitly ends it", () => {
    // Closing -> ended requires an explicit ending flag from extraction.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.closing, {
      name: "David",
      service: "consulting",
      preferredDate: "Tuesday"
    });

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams),
      cache
    );

    expect(actions).toEqual([Action.tryClosing]);
    expect(cache.state).toBe(ConversationState.closing);
  });

  it("ends the conversation from closing when there is no concern or update", () => {
    // Closing is the confirmation stage; a normal ending event should finish the conversation.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.closing, {
      name: "David",
      service: "consulting",
      preferredDate: "Tuesday"
    });

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.tryEnding),
      cache
    );

    expect(actions).toEqual([Action.endConversation]);
    expect(cache.state).toBe(ConversationState.ended);
  });

  it("ignores any new input once the conversation is ended", () => {
    // Ended conversations should be stable and should not re-open accidentally.
    const machine = new ConversationStateMachine();
    const cache = createCache(ConversationState.ended);

    const actions = machine.recognizeNewState(
      llmOutput(ConversationEvent.updateParams, { name: "Later user" }),
      cache
    );

    expect(actions).toEqual([Action.ignore]);
    expect(cache.state).toBe(ConversationState.ended);
  });
});
