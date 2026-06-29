import { describe, expect, it } from "vitest";
import { Executer } from "../../src/MessageService/context/executer";
import { CommunicationChannel, MessageProvider } from "../../src/dataClients/Types/apiTypes";
import { ConversationCacheState } from "../../src/dataClients/Types/messageTypes";
import { ConversationEvent, ConversationState, StateMachineInput, StateMachineOutput } from "../../src/dataClients/Types/stateMachineTypes";
import { NullLogger } from "../../src/logging/logger";
import { FakeLlmProvider } from "../fakes/FakeLlmProvider";

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
    lastMessages: [
      { role: "bot", content: "Hi, how can I help?" }
    ],
    updatedAt: new Date("2026-05-25T00:00:00.000Z"),
    phone: "+10000000000"
  };
}

function inputFromCache(cache: ConversationCacheState, messageContent: string): StateMachineInput {
  return {
    currentState: cache.state,
    messageContent,
    collectedParams: cache.collectedParams,
    lastMessages: cache.lastMessages,
    businessContext: null
  };
}

function generatedEvent(
  conversationEvent: ConversationEvent,
  params?: Record<string, string | number | null>
): StateMachineOutput {
  return {
    conversationEvent,
    newConclusion: `Fake generated event: ${conversationEvent}`,
    params
  };
}

describe("Executer with fake LLM generations", () => {
  it("applies a partial LLM param and generates the next missing-param message", async () => {
    // The fake LLM simulates extracting one useful field from the user's text.
    const cache = createCache(ConversationState.collecting);
    const input = inputFromCache(cache, "My name is David");
    const llm = new FakeLlmProvider({
      events: [generatedEvent(ConversationEvent.updateParams, { name: "David" })],
      responses: ["Thanks David, what service do you need?"]
    });
    const executer = new Executer(llm, new NullLogger());

    const result = await executer.prepareAndExecute(input, cache);

    expect(result.response).toBe("Thanks David, what service do you need?");
    expect(result.collectedParams).toEqual({
      name: "David",
      service: null,
      preferredDate: null
    });
    expect(cache.state).toBe(ConversationState.collecting);
    expect(llm.responseInputs).toHaveLength(1);
    expect(llm.closingInputs).toHaveLength(0);
  });

  it("applies final params and generates a closing message", async () => {
    // This covers the minimum happy path once the LLM extracts the remaining fields.
    const cache = createCache(ConversationState.collecting, {
      name: "David",
      service: null,
      preferredDate: null
    });
    const input = inputFromCache(cache, "I need consulting on Monday");
    const llm = new FakeLlmProvider({
      events: [
        generatedEvent(ConversationEvent.updateParams, {
          service: "consulting",
          preferredDate: "Monday"
        })
      ],
      closingMessages: ["Great, I have everything I need."]
    });
    const executer = new Executer(llm, new NullLogger());

    const result = await executer.prepareAndExecute(input, cache);

    expect(result.response).toBe("Great, I have everything I need.");
    expect(result.collectedParams).toEqual({
      name: "David",
      service: "consulting",
      preferredDate: "Monday"
    });
    expect(cache.state).toBe(ConversationState.closing);
    expect(llm.responseInputs).toHaveLength(0);
    expect(llm.closingInputs).toHaveLength(1);
  });

  it("keeps a concern in the business flow and asks for missing params", async () => {
    // Concern is now conversation mode only; the executor still follows business-state actions.
    const cache = createCache(ConversationState.collecting);
    const input = inputFromCache(cache, "I am worried about the price, this is for consulting");
    const llm = new FakeLlmProvider({
      events: [generatedEvent(ConversationEvent.concern, { service: "consulting" })],
      responses: ["Thanks, what date works best?"]
    });
    const executer = new Executer(llm, new NullLogger());

    const result = await executer.prepareAndExecute(input, cache);

    expect(result.response).toBe("Thanks, what date works best?");
    expect(result.collectedParams.service).toBe("consulting");
    expect(cache.state).toBe(ConversationState.collecting);
    expect(llm.responseInputs).toHaveLength(1);
  });

  it("ignores null and empty generated params instead of erasing collected values", async () => {
    // Fake bad extraction: the LLM returns empty values, which should not overwrite real answers.
    const cache = createCache(ConversationState.collecting, {
      name: "David",
      service: null,
      preferredDate: null
    });
    const input = inputFromCache(cache, "Actually I am not sure yet");
    const llm = new FakeLlmProvider({
      events: [generatedEvent(ConversationEvent.updateParams, { name: "", service: null })],
      responses: ["No problem. What service should I help you with?"]
    });
    const executer = new Executer(llm, new NullLogger());

    const result = await executer.prepareAndExecute(input, cache);

    expect(result.response).toBe("No problem. What service should I help you with?");
    expect(result.collectedParams).toEqual({
      name: "David",
      service: null,
      preferredDate: null
    });
    expect(cache.state).toBe(ConversationState.collecting);
  });

  it("generates a missing-param response when the user continues normally", async () => {
    const cache = createCache(ConversationState.collecting);
    const input = inputFromCache(cache, "I need my home cleaned");
    const llm = new FakeLlmProvider({
      events: [generatedEvent(ConversationEvent.updateParams, { service: "home cleaning" })],
      responses: ["Thanks, what city are you located in?"]
    });
    const executer = new Executer(llm, new NullLogger());

    const result = await executer.prepareAndExecute(input, cache);

    expect(result.response).toBe("Thanks, what city are you located in?");
    expect(result.collectedParams.service).toBe("home cleaning");
    expect(cache.state).toBe(ConversationState.collecting);
    expect(llm.responseInputs).toHaveLength(1);
  });
});
