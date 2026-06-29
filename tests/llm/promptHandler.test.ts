import { describe, expect, it } from "vitest";
import { buildClosingPrompt, buildEventPrompt, buildMessagePrompt, parseEventResponse } from "../../src/llm/promptHandler";
import {
  ConversationEvent,
  ConversationMode,
  ConversationState,
  ResponseIntent,
  StateMachineInput,
  StateMachineOutput
} from "../../src/dataClients/Types/stateMachineTypes";

function input(): StateMachineInput {
  return {
    currentState: ConversationState.collecting,
    messageContent: "I am not sure I understand the pricing",
    collectedParams: {
      name: "David",
      service: null,
      preferredDate: null
    },
    lastMessages: [
      { role: "bot", content: "What service do you need?" }
    ],
    businessContext: null
  };
}

function output(
  conversationMode: ConversationMode,
  responseIntent: ResponseIntent
): StateMachineOutput {
  return {
    conversationEvent: ConversationEvent.concern,
    conversationMode,
    responseIntent,
    newConclusion: "User is unsure about pricing",
    params: {}
  };
}

describe("promptHandler response prompts", () => {
  it("tells generateResponse not to push for params when the mode is pacing", () => {
    const prompt = buildMessagePrompt(
      output(ConversationMode.pacing, ResponseIntent.askForParam),
      input()
    );

    expect(prompt).toContain("CONVERSATION MODE: pacing");
    expect(prompt).toContain("Do not push for more information in this reply.");
    expect(prompt).toContain("ask a new business question only when mode is \"neutral\" or \"leadin\"");
    expect(prompt).toContain("MISSING PARAMETERS: service, preferredDate");
  });

  it("tells closing responses to prioritize clarification over closing pressure", () => {
    const prompt = buildClosingPrompt(
      input(),
      output(ConversationMode.clarifying, ResponseIntent.close)
    );

    expect(prompt).toContain("CONVERSATION MODE: clarifying");
    expect(prompt).toContain("Clarify the confusion or ambiguous point.");
    expect(prompt).toContain("If mode conflicts with responseIntent, prioritize the mode");
  });
});

describe("promptHandler event extraction", () => {
  it("keeps state-machine events separate from response intents in the event prompt", () => {
    const prompt = buildEventPrompt(input());

    expect(prompt).toContain("event = business state-machine progress only");
    expect(prompt).toContain("Forbidden event values: askForParam");
    expect(prompt).toContain('intent "askForParam"; do not put it in event');
    expect(prompt).toContain('use event "updateParams" with params {}');
  });

  it("remaps a misplaced response intent in event instead of failing the conversation", () => {
    const parsed = parseEventResponse(JSON.stringify({
      event: "askForParam",
      mode: "leadin",
      params: {},
      summary: "User should be asked for city"
    }));

    expect(parsed).toEqual({
      conversationEvent: ConversationEvent.updateParams,
      conversationMode: ConversationMode.leadin,
      responseIntent: ResponseIntent.askForParam,
      newConclusion: "User should be asked for city",
      params: {}
    });
  });
});
